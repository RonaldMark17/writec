import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from submission_intake import ReviewedSubmission, submit_reviewed_work

STUDENT = '00000000-0000-0000-0000-000000000003'
ASSIGNMENT = '00000000-0000-0000-0000-000000000005'


@patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'test-service'})
class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.body = ReviewedSubmission(assignment_id=ASSIGNMENT, title='My essay',
            file_url=f'{STUDENT}/{ASSIGNMENT}/essay.jpg', text='Student reviewed essay text')
        self.request = SimpleNamespace(base_url='http://localhost:8000/',
            app=SimpleNamespace(state=SimpleNamespace(upload_root='.')))
        self.access = patch('submission_intake.require_assignment', return_value={'id': STUDENT, 'role': 'student'}).start()
        self.db = patch('submission_intake.supabase_request').start()
        self.addCleanup(patch.stopall)

    def test_saves_text_and_original_together_without_accepting_a_client_score(self):
        self.db.side_effect = lambda path, token, payload=None: ([dict(payload)] if payload else
            [{'classroom_id': 'class'}] if 'assignmentTable' in path else [])
        result = submit_reviewed_work(self.body, self.request)
        payload = self.db.call_args.args[2]
        self.assertEqual(payload['transcribed_text'], self.body.text)
        self.assertEqual(payload['file_url'], self.body.file_url)
        self.assertEqual(payload['student_id'], STUDENT)
        self.assertNotIn('scan_result', payload)
        self.assertFalse(result['already_submitted'])
        with self.assertRaises(ValidationError):
            ReviewedSubmission(**{**self.body.model_dump(), 'scan_result': {'score': 0}})

    def test_retry_uses_existing_work_without_overwriting_or_enqueueing_again(self):
        self.db.return_value = [{'id': 'existing'}]
        result = submit_reviewed_work(self.body, self.request)
        self.assertEqual(result, {'id': 'existing', 'already_submitted': True})
        self.assertEqual(self.db.call_count, 1)

    def test_concurrent_conflict_confirms_the_saved_row(self):
        stable = str(uuid.uuid5(uuid.NAMESPACE_URL, f'writecheck:{STUDENT}:{ASSIGNMENT}'))
        self.db.side_effect = [[], [{'classroom_id': 'class'}], HTTPException(409), [{'id': stable}]]
        self.assertEqual(submit_reviewed_work(self.body, self.request)['id'], stable)
        self.assertEqual(self.db.call_args_list[2].args[2]['id'], stable)

    def test_failed_save_does_not_report_success(self):
        self.db.side_effect = [[], [{'classroom_id': 'class'}], HTTPException(503), []]
        with self.assertRaises(HTTPException):
            submit_reviewed_work(self.body, self.request)

    def test_denied_assignment_does_not_use_service_credential(self):
        self.access.side_effect = HTTPException(403)
        with self.assertRaises(HTTPException):
            submit_reviewed_work(self.body, self.request)
        self.db.assert_not_called()

    def test_cannot_submit_someone_elses_file_or_submit_as_teacher(self):
        self.body.file_url = f'other-student/{ASSIGNMENT}/essay.jpg'
        with self.assertRaises(HTTPException):
            submit_reviewed_work(self.body, self.request)
        self.body.file_url = f'{STUDENT}/{ASSIGNMENT}/essay.jpg'
        self.access.return_value['role'] = 'teacher'
        with self.assertRaises(HTTPException):
            submit_reviewed_work(self.body, self.request)
        self.db.assert_not_called()

    def test_late_submission_is_rejected_when_closed(self):
        self.db.side_effect = [[], [{'classroom_id': 'class', 'due_date': '2000-01-01T00:00:00Z', 'accept_late_submissions': False}]]
        with self.assertRaises(HTTPException) as failure:
            submit_reviewed_work(self.body, self.request)
        self.assertEqual(failure.exception.status_code, 403)
        self.assertEqual(self.db.call_count, 2)

    def test_failed_resubmission_uses_verified_student_and_atomic_rpc(self):
        self.body.retry_job_id = uuid.UUID('00000000-0000-0000-0000-000000000010')
        self.db.side_effect = [[{'id': 'existing'}], {'id': 'existing', 'already_submitted': False}]
        result = submit_reviewed_work(self.body, self.request)
        self.assertEqual(result['id'], 'existing')
        path, token, values = self.db.call_args.args
        self.assertEqual(path, '/rest/v1/rpc/resubmit_failed_submission')
        self.assertEqual(values['student_key'], STUDENT)
        self.assertEqual(values['expected_job'], str(self.body.retry_job_id))
        self.assertEqual(values['new_text'], self.body.text)

    def test_resubmission_rejection_does_not_become_existing_submission_success(self):
        self.body.retry_job_id = uuid.uuid4()
        self.db.side_effect = [[{'id': 'existing'}], HTTPException(400, 'Graded work cannot be resubmitted.')]
        with self.assertRaises(HTTPException) as failure:
            submit_reviewed_work(self.body, self.request)
        self.assertIn('Graded work', failure.exception.detail)


if __name__ == '__main__':
    unittest.main()
