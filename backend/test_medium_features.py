import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from document_text import extract_document
from notifications import NotificationWorker
from service_status import router
from user_preferences import detection_preferences, review_badge, teacher_preferences


class PreferencesTests(unittest.TestCase):
    def test_threshold_changes_alert_without_changing_score(self):
        self.assertEqual(review_badge(7, {'plagiarismSensitivity': 'strict'})['tone'], 'amber')
        self.assertEqual(review_badge(7, {'plagiarismSensitivity': 'standard'})['tone'], 'emerald')
        self.assertEqual(review_badge(15, {'plagiarismSensitivity': 'permissive'})['tone'], 'emerald')
        self.assertEqual(review_badge(55, {})['tone'], 'red')

    def test_metadata_validation(self):
        self.assertEqual(detection_preferences({'writecheck_preferences': []}),
                         {'plagiarismSensitivity': 'standard', 'peerCrossCheck': True})
        self.assertFalse(detection_preferences({'writecheck_preferences': {'peerCrossCheck': False}})['peerCrossCheck'])

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('user_preferences.supabase_request')
    def test_assignment_owner_selects_preferences_not_student(self, db):
        db.side_effect = [[{'teacher_id': 'teacher'}], {'user_metadata': {
            'writecheck_preferences': {'plagiarismSensitivity': 'strict', 'peerCrossCheck': False}}}]
        prefs = teacher_preferences({'assignment_id': 'assignment', 'teacher_id': 'forged'})
        self.assertFalse(prefs['peerCrossCheck'])
        self.assertEqual(db.call_args.args[0], '/auth/v1/admin/users/teacher')


class MixedPdfTests(unittest.TestCase):
    @patch('pypdf.PdfReader')
    def test_mixed_page_keeps_typed_text_and_reads_handwriting(self, reader):
        reader.return_value.pages = [SimpleNamespace(extract_text=lambda: 'Typed heading',
            images=[SimpleNamespace(data=b'image', name='essay.png')])]
        ocr = Mock(return_value='Handwritten essay')
        self.assertEqual(extract_document(b'pdf', 'mixed.pdf', ocr), 'Typed heading\nHandwritten essay')
        ocr.assert_called_once_with(b'image', 'essay.png')

    @patch('pypdf.PdfReader')
    def test_exact_duplicate_text_layer_is_not_repeated(self, reader):
        reader.return_value.pages = [SimpleNamespace(extract_text=lambda: 'Same text',
            images=[SimpleNamespace(data=b'image', name='essay.png')])]
        self.assertEqual(extract_document(b'pdf', 'mixed.pdf', Mock(return_value='Same  text')), 'Same text')


@patch.dict('os.environ', {'NOTIFICATIONS_ENABLED': '1', 'SMTP_HOST': 'smtp.example.test',
                          'SMTP_FROM': 'app@example.test', 'SUPABASE_SERVICE_ROLE_KEY': 'service'})
class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.worker = NotificationWorker(self.tmp.name + '/receipts.db')
        self.now = datetime(2026, 9, 28, 8, tzinfo=timezone.utc)  # Monday
        self.send = patch('notifications.send_email').start()
        self.db = patch('notifications.supabase_request').start()
        self.addCleanup(patch.stopall)
        self.prefs = {'notifyOnSubmissions': True, 'weeklyDigest': True}
        self.status = 'active'
        self.db.side_effect = self.query

    def query(self, path, token):
        if '/submissionTable?' in path:
            return [{'id': 'essay', 'classroom_id': 'class', 'created_at': self.now.isoformat()}]
        if '/classroomTable?' in path:
            return [{'teacher_id': 'teacher'}]
        if '/userTable?' in path:
            return [{'role': 'teacher', 'account_status': self.status}]
        return {'email': 'teacher@example.test', 'email_confirmed_at': self.now.isoformat(),
                'user_metadata': {'writecheck_preferences': self.prefs}}

    def test_receipts_survive_restart_and_prevent_repeat_emails(self):
        self.worker.tick(self.now)
        NotificationWorker(self.worker.database).tick(self.now + timedelta(minutes=1))
        self.assertEqual(self.send.call_count, 2)
        self.assertIn('digest:', self.send.call_args.args[3])

    def test_disabled_or_inactive_teacher_receives_nothing(self):
        self.prefs = {}
        self.worker.tick(self.now)
        self.prefs = {'notifyOnSubmissions': True, 'weeklyDigest': True}
        self.status = 'inactive'
        self.worker.tick(self.now)
        self.send.assert_not_called()

    def test_delivery_failure_is_retried_without_false_receipt(self):
        self.prefs = {'notifyOnSubmissions': True}
        self.send.side_effect = [RuntimeError('SMTP down'), None]
        self.worker.tick(self.now)
        self.worker.tick(self.now + timedelta(minutes=1))
        self.worker.tick(self.now + timedelta(minutes=2))
        self.assertEqual(self.send.call_count, 2)

    def test_disabled_dispatcher_never_contacts_database_or_smtp(self):
        with patch.dict('os.environ', {'NOTIFICATIONS_ENABLED': '0'}):
            self.worker.tick(self.now)
        self.db.assert_not_called()
        self.send.assert_not_called()


class ServiceStatusTests(unittest.TestCase):
    @patch('service_status.authenticated_account', return_value={'role': 'teacher'})
    @patch('service_status.copyleaks_service')
    @patch.dict('os.environ', {'COPYLEAKS_EMAIL': 'test@example.test', 'COPYLEAKS_API_KEY': 'test'})
    def test_zero_credit_and_model_readiness_are_truthful(self, service, account):
        app = FastAPI()
        app.include_router(router)
        app.state.ocr_ready = True
        service.is_sandbox = False
        service.get_credit_balance.return_value = 0
        result = TestClient(app).get('/api/preferences/services').json()
        self.assertEqual(result['copyleaks'], 'No credits available')
        self.assertEqual(result['ocr'], 'Models loaded')
        service.get_credit_balance.side_effect = RuntimeError('secret internal error')
        result = TestClient(app).get('/api/preferences/services').json()
        self.assertNotIn('secret', str(result))
        self.assertIn('Unavailable', result['copyleaks'])


if __name__ == '__main__':
    unittest.main()
