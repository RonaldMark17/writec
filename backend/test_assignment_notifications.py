import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from notifications import NotificationWorker, send_email


@patch.dict('os.environ', {'NOTIFICATIONS_ENABLED': '1', 'SMTP_HOST': 'smtp.test',
                         'SMTP_FROM': 'sender@example.test', 'SUPABASE_SERVICE_ROLE_KEY': 'test'})
class AssignmentNotificationsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.worker = NotificationWorker(temp.name + '/receipts.db')
        self.now = datetime(2026, 9, 28, tzinfo=timezone.utc)
        self.active = True
        self.confirmed = True
        self.paths = []
        self.send = patch('notifications.send_email').start()
        patch('notifications.supabase_request', side_effect=self.query).start()
        self.addCleanup(patch.stopall)

    def query(self, path, token):
        self.paths.append(path)
        if '/assignmentTable?' in path:
            return [{'id': 'assignment', 'classroom_id': 'class', 'title': 'Essay',
                     'instructions': 'Write about nature.', 'due_date': '2026-10-01'}]
        if '/classroomTable?' in path:
            return [{'classroom_name': 'English'}]
        if '/classroomMembers?' in path:
            return [{'student_id': 'one'}, {'student_id': 'two'}]
        if '/userTable?' in path:
            return [{'role': 'student', 'account_status': 'active' if self.active else 'inactive'}]
        if '/auth/v1/admin/users/' in path:
            return {'email': path.rsplit('/', 1)[1] + '@example.test',
                    'email_confirmed_at': self.now.isoformat() if self.confirmed else None}
        if '/submissionTable?' in path:
            return []
        raise AssertionError(path)

    def test_each_member_gets_details_once_across_restart(self):
        self.worker.tick(self.now)
        NotificationWorker(self.worker.database).tick(self.now + timedelta(minutes=1))
        self.assertEqual(self.send.call_count, 2)
        self.assertEqual({c.args[0] for c in self.send.call_args_list}, {'one@example.test', 'two@example.test'})
        body = self.send.call_args.args[2]
        for value in ['English', 'Essay', 'Write about nature.', '2026-10-01']:
            self.assertIn(value, body)
        self.assertTrue(any('created_at=gte.' in p for p in self.paths))

    def test_failure_does_not_block_other_member_and_retries(self):
        self.send.side_effect = [RuntimeError('SMTP unavailable'), None, None]
        self.worker.tick(self.now)
        self.worker.tick(self.now + timedelta(minutes=1))
        self.worker.tick(self.now + timedelta(minutes=2))
        self.assertEqual([c.args[0] for c in self.send.call_args_list],
                         ['one@example.test', 'two@example.test', 'one@example.test'])

    def test_inactive_and_unverified_students_skipped(self):
        self.active = False
        self.worker.tick(self.now)
        self.active = True
        self.confirmed = False
        self.worker.tick(self.now)
        self.send.assert_not_called()

    def test_pagination(self):
        with patch('notifications.supabase_request', side_effect=[[{}] * 500, [{}]]) as query:
            self.assertEqual(len(list(self.worker.pages('/test?select=id', 'token'))), 501)
            self.assertIn('offset=500', query.call_args.args[0])


class SMTPTests(unittest.TestCase):
    @patch.dict('os.environ', {'SMTP_HOST': 'smtp.test', 'SMTP_FROM': 'sender@example.test',
                             'SMTP_USER': 'sender@example.test', 'SMTP_PASSWORD': 'test',
                             'SMTP_SSL': '1', 'SMTP_PORT': '465'})
    @patch('notifications.smtplib.SMTP_SSL')
    def test_ssl_auth_and_private_recipient(self, smtp):
        client = smtp.return_value.__enter__.return_value
        client.send_message.return_value = {}
        send_email('student@example.test', 'Assignment', 'Details', 'assignment:a:s')
        client.login.assert_called_once_with('sender@example.test', 'test')
        message = client.send_message.call_args.args[0]
        self.assertEqual(message['To'], 'student@example.test')
        self.assertIsNone(message['Cc'])
        client.starttls.assert_not_called()


if __name__ == '__main__':
    unittest.main()
