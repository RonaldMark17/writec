"""Single-dispatcher email delivery with persistent receipts and retries.

Disabled by default. Run on exactly one backend with persistent local storage.
SMTP acknowledgement and receipt commit cannot be atomic: rare duplicates after
a crash are possible; stable Message-ID values help mail clients deduplicate.
"""
import logging
import os
import smtplib
import sqlite3
import ssl
import threading
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote

from admin_api import supabase_request

log = logging.getLogger(__name__)


def configured():
    return (os.getenv('NOTIFICATIONS_ENABLED') == '1'
            and all(os.getenv(key) for key in ('SMTP_HOST', 'SMTP_FROM', 'SUPABASE_SERVICE_ROLE_KEY')))


def send_email(recipient, subject, body, key):
    message = EmailMessage()
    message['From'] = os.environ['SMTP_FROM']
    message['To'] = recipient
    message['Subject'] = subject
    message['Message-ID'] = '<' + sha256(key.encode()).hexdigest() + '@writecheck.notifications>'
    message.set_content(body)
    # TLS is mandatory; there is no plaintext credential mode.
    implicit = os.getenv('SMTP_SSL') == '1'
    port = int(os.getenv('SMTP_PORT', '465' if implicit else '587'))
    smtp = smtplib.SMTP_SSL if implicit else smtplib.SMTP
    kwargs = {'context': ssl.create_default_context()} if implicit else {}
    with smtp(os.environ['SMTP_HOST'], port, timeout=20, **kwargs) as client:
        if not implicit:
            client.starttls(context=ssl.create_default_context())
        if os.getenv('SMTP_USER'):
            client.login(os.environ['SMTP_USER'], os.environ.get('SMTP_PASSWORD', ''))
        refused = client.send_message(message)
        if refused:
            raise RuntimeError('Notification recipient rejected.')


class NotificationWorker:
    def __init__(self, database=None):
        self.database = str(database or os.getenv('NOTIFICATIONS_DB') or Path(__file__).with_name('notifications.db'))
        self.stop = threading.Event()

    def connect(self):
        db = sqlite3.connect(self.database)
        db.execute('CREATE TABLE IF NOT EXISTS receipts (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        return db

    def deliver(self, db, key, recipient, subject, body, now):
        if db.execute('SELECT 1 FROM receipts WHERE key=?', (key,)).fetchone():
            return
        send_email(recipient, subject, body, key)
        db.execute('INSERT INTO receipts VALUES (?,?)', (key, now.isoformat()))
        db.commit()

    def tick(self, now=None):
        if not configured():
            return
        now = now or datetime.now(timezone.utc)
        token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
        with closing(self.connect()) as db:
            db.execute('INSERT OR IGNORE INTO metadata VALUES (?,?)', ('activated', now.isoformat()))
            db.commit()
            activated = datetime.fromisoformat(db.execute("SELECT value FROM metadata WHERE key='activated'").fetchone()[0])
            # Never send a backlog predating dispatcher activation. Retain failed
            # notifications for seven days, retrying once per minute.
            since = max(activated, now - timedelta(days=7))
            rows = []
            offset = 0
            while True:
                page = supabase_request('/rest/v1/submissionTable?select=id,classroom_id,created_at'
                    + '&created_at=gte.' + quote(since.isoformat(), safe='')
                    + '&order=created_at.asc,id.asc&limit=500&offset=' + str(offset), token)
                rows.extend(page)
                if len(page) < 500:
                    break
                offset += len(page)
            classrooms = {}
            grouped = defaultdict(list)
            for row in rows:
                cid = str(row['classroom_id'])
                if cid not in classrooms:
                    found = supabase_request('/rest/v1/classroomTable?id=eq.' + quote(cid, safe='') + '&select=teacher_id', token)
                    classrooms[cid] = found[0]['teacher_id'] if found else None
                if classrooms[cid]:
                    grouped[str(classrooms[cid])].append(row)
            for teacher, submissions in grouped.items():
                try:
                    profile = supabase_request('/rest/v1/userTable?id=eq.' + quote(teacher, safe='') + '&select=account_status,role', token)
                    if not profile or profile[0].get('account_status') != 'active' or profile[0].get('role') != 'teacher':
                        continue
                    user = supabase_request('/auth/v1/admin/users/' + quote(teacher, safe=''), token)
                    prefs = (user.get('user_metadata') or {}).get('writecheck_preferences') or {}
                    if not isinstance(prefs, dict) or not user.get('email') or not user.get('email_confirmed_at'):
                        continue
                    if prefs.get('notifyOnSubmissions') is True:
                        for submission in submissions:
                            self.deliver(db, 'submission:' + str(submission['id']), user['email'],
                                'WriteCheck: new student submission',
                                'A student submitted work in one of your classes. Sign in to WriteCheck to review it. '
                                'API results may still be processing.', now)
                    # First Monday tick sends one digest per teacher per UTC week.
                    if prefs.get('weeklyDigest') is True and now.weekday() == 0:
                        year, week, _ = now.isocalendar()
                        self.deliver(db, f'digest:{teacher}:{year}:{week}', user['email'],
                            'WriteCheck: weekly submission digest',
                            f'{len(submissions)} submissions were received in your classes during the last seven days '
                            '(or since notifications were enabled). Sign in to review their processing status and results.', now)
                except Exception:
                    log.warning('Notification delivery deferred; check SMTP/database configuration.')

    def run(self):
        if not configured():
            return
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception:
                log.warning('Notification service unavailable; retrying in one minute.')
            self.stop.wait(60)
