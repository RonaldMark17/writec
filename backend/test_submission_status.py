import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
from submission_status import verified_status, teacher_submission_status

JOB_ID = '00000000-0000-0000-0000-000000000001'
SCAN_ID = 'j00000000000000000000000000000001'


class StatusTests(unittest.TestCase):
    def job(self, **values):
        return {'id': JOB_ID, 'state': 'ready', 'checkpoint': {'mode': 'copyleaks'}, **values}

    def row(self):
        return {'id': JOB_ID, 'transcribed_text': 'Saved essay', 'file_url': 'essay.jpg',
                'scan_result': {'mode': 'copyleaks', 'score': 1.6}}

    def payload(self, score=0):
        return {'status': 0, 'scannedDocument': {'scanId': SCAN_ID, 'totalWords': 25},
                'results': {'score': {'aggregatedScore': score}, 'internet': []}}

    def test_old_worker_ready_flag_cannot_hide_provider_failure(self):
        row, state = verified_status(self.row(), self.job(provider_error='Provider reported a failed scan.'))
        self.assertEqual(state['state'], 'failed')
        self.assertIn('No verified Copyleaks result', state['error'])
        self.assertIsNone(row['scan_result'])
        self.assertEqual(row['transcribed_text'], 'Saved essay')
        self.assertEqual(row['file_url'], 'essay.jpg')

    def test_unverified_checkpoint_estimate_is_not_a_completed_api_result(self):
        row, state = verified_status(self.row(), self.job(checkpoint={'mode': 'copyleaks', 'provider': {'score': 1.6}}))
        self.assertIsNone(row['scan_result'])
        self.assertEqual(state['state'], 'failed')

    def test_genuine_zero_score_displays_and_replaces_older_estimate(self):
        row, state = verified_status(self.row(), self.job(provider_result=self.payload()))
        self.assertEqual(state['state'], 'ready')
        self.assertEqual(row['scan_result']['score'], 0)
        self.assertEqual(row['scan_result']['provider'], 'copyleaks')
        self.assertEqual(row['scan_result']['scanId'], SCAN_ID)

    def test_another_scans_callback_is_rejected(self):
        payload = self.payload()
        payload['scannedDocument']['scanId'] = 'other-scan'
        row, state = verified_status(self.row(), self.job(provider_result=payload))
        self.assertEqual(state['state'], 'failed')
        self.assertIsNone(row['scan_result'])

    def test_pending_job_is_not_misreported_as_a_failure(self):
        row, state = verified_status(self.row(), self.job(state='processing'))
        self.assertEqual(state['state'], 'processing')
        self.assertIsNone(row['scan_result'])

    def test_report_cannot_claim_classroom_mode_without_server_checkpoint(self):
        row = self.row()
        row['scan_result']['mode'] = 'classroom'
        _, state = verified_status(row, self.job(checkpoint={}))
        self.assertEqual(state['state'], 'failed')

    def test_explicit_classroom_job_preserves_classroom_report(self):
        row = self.row()
        row['scan_result']['mode'] = 'classroom'
        verified, state = verified_status(row, self.job(checkpoint={'mode': 'classroom'}))
        self.assertEqual(state['state'], 'ready')
        self.assertEqual(verified['scan_result']['mode'], 'classroom')

    @patch('submission_status.supabase_request')
    @patch('submission_status.authenticated_account', return_value={'role': 'student'})
    def test_student_cannot_read_private_job_diagnostics(self, auth, db):
        with self.assertRaises(HTTPException):
            teacher_submission_status(SimpleNamespace())
        db.assert_not_called()

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('submission_status.copyleaks_service.get_credit_balance', return_value=0)
    @patch('submission_status.supabase_request')
    @patch('submission_status.authenticated_account', return_value={'role': 'teacher'})
    def test_only_visible_jobs_are_read_and_raw_callbacks_are_not_exposed(self, auth, db, balance):
        row = self.row()
        job = self.job(submission_id=JOB_ID, provider_result=self.payload())
        db.side_effect = [[row], [job]]
        response = teacher_submission_status(SimpleNamespace(state=SimpleNamespace(access_token='teacher-token')))
        self.assertEqual(db.call_args_list[0].args[1], 'teacher-token')
        self.assertIn(JOB_ID, db.call_args_list[1].args[0])
        self.assertEqual(response['provider']['credits'], 0)
        self.assertEqual(response['results'][0]['scan_result']['score'], 0)
        self.assertNotIn('checkpoint', response['results'][0])
        self.assertNotIn('provider_result', response['progress'][JOB_ID])


if __name__ == '__main__':
    unittest.main()
