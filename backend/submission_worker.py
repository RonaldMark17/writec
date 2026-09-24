"""Durable submission worker. Supabase holds jobs, checkpoints, leases and results."""
import logging
import os
import threading
from types import SimpleNamespace
from urllib.parse import quote

from admin_api import supabase_request
from submission_access import file_reference, local_file, storage_download
from document_text import extract_document

log = logging.getLogger(__name__)


class LostLease(RuntimeError):
    pass


class SubmissionWorker:
    def __init__(self, upload_root, image_ocr, checker, token=None):
        self.upload_root = upload_root
        self.image_ocr = image_ocr
        self.checker = checker
        self.token = token or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        self.stop = threading.Event()

    def rpc(self, name, payload):
        return supabase_request('/rest/v1/rpc/' + name, self.token, payload)

    def checkpoint(self, job, data=None):
        if not self.rpc('checkpoint_submission_job', {
            'job_key': job['submission_id'], 'lease_key': job['lease'], 'saved_checkpoint': data,
        }):
            raise LostLease('Job is now owned by another worker.')

    def process(self, job):
        done = threading.Event()
        lost = threading.Event()

        def heartbeat():
            while not done.wait(30):
                try:
                    self.checkpoint(job)
                except Exception:
                    lost.set()
                    return

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            rows = supabase_request('/rest/v1/submissionTable?id=eq.' + quote(job['submission_id'], safe=''), self.token)
            if len(rows) != 1:
                raise ValueError('Submission no longer exists.')
            submission = rows[0]
            checkpoint = dict(job.get('checkpoint') or {})
            text = checkpoint.get('text') or job.get('input_text')
            if not text:
                kind, key = file_reference(submission['file_url'])
                if kind == 'local':
                    data = local_file(self.upload_root, key).read_bytes()
                else:
                    data = storage_download(SimpleNamespace(state=SimpleNamespace(access_token=self.token)), key)
                text = extract_document(data, key, self.image_ocr)
            checkpoint['text'] = text
            self.checkpoint(job, checkpoint)
            result = self.checker(job, submission, text, checkpoint, lambda cp: self.checkpoint(job, cp))
            if lost.is_set():
                raise LostLease('Lease renewal failed.')
            saved = self.rpc('finish_submission_job', {
                'job_key': job['submission_id'], 'lease_key': job['lease'],
                'result_text': text, 'result_scan': result, 'failure': None,
            })
            if saved is not True:
                raise LostLease('The completed result was not accepted by the database.')
        except LostLease:
            log.warning('Submission lease lost; stale result discarded.')
        except Exception as exc:
            # Keep raw provider responses and file paths out of student-visible data.
            message = str(exc) if isinstance(exc, ValueError) else 'Processing failed. Check worker configuration and retry.'
            log.warning('Submission processing failed (%s).', type(exc).__name__)
            try:
                self.rpc('finish_submission_job', {
                    'job_key': job['submission_id'], 'lease_key': job['lease'],
                    'result_text': None, 'result_scan': None, 'failure': message,
                })
            except Exception:
                log.warning('Could not save failure; the expired lease will be recovered.')
        finally:
            done.set()
            thread.join(timeout=1)

    def run(self):
        if not self.token:
            log.error('Automatic processing requires SUPABASE_SERVICE_ROLE_KEY in the backend environment.')
            return
        while not self.stop.is_set():
            try:
                job = self.rpc('claim_submission_job', {})
                if job:
                    self.process(job)
                    continue
            except Exception:
                log.warning('Submission queue unavailable; retrying shortly.')
            self.stop.wait(5)
