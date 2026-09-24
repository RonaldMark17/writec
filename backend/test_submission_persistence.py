import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
from submission_persistence import save_results, read_results


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.request = SimpleNamespace(state=SimpleNamespace(access_token='test-token'))

    @patch('submission_persistence.supabase_request')
    def test_confirmed_grade_including_zero(self, db):
        db.return_value = [{'id': 'submission-1', 'grade': '0'}]
        result = save_results(self.request, 'submission-1', {'grade': '0', 'feedback': '', 'student_id': 'other'})
        self.assertEqual(result['grade'], '0')
        self.assertEqual(db.call_args.args[2], {'grade': '0', 'feedback': ''})
        self.assertEqual(db.call_args.kwargs['method'], 'PATCH')

    @patch('submission_persistence.supabase_request')
    def test_no_updated_row_is_failure(self, db):
        db.return_value = []
        with self.assertRaises(HTTPException):
            save_results(self.request, 'missing', {'grade': '80'})

    @patch('submission_persistence.supabase_request')
    def test_database_failure_propagates_and_retry_is_same_write(self, db):
        db.side_effect = [HTTPException(503, 'Unavailable'), [{'id': 's', 'grade': '80'}]]
        with self.assertRaises(HTTPException):
            save_results(self.request, 's', {'grade': '80'})
        self.assertEqual(save_results(self.request, 's', {'grade': '80'})['grade'], '80')
        self.assertEqual(db.call_args_list[0], db.call_args_list[1])

    @patch('submission_persistence.supabase_request')
    def test_scan_does_not_erase_grade(self, db):
        db.return_value = [{'id': 's', 'grade': '90'}]
        save_results(self.request, 's', {'transcribed_text': 'essay', 'scan_result': {'score': 0}})
        self.assertNotIn('grade', db.call_args.args[2])
        self.assertNotIn('status', db.call_args.args[2])

    @patch('submission_persistence.supabase_request')
    def test_invalid_grade_never_written(self, db):
        for grade in [{}, [], 'x' * 121]:
            with self.assertRaises(HTTPException):
                save_results(self.request, 's', {'grade': grade})
        db.assert_not_called()

    @patch('submission_persistence.authenticated_account')
    @patch('submission_persistence.supabase_request')
    def test_reads_authoritative_results(self, db, auth):
        db.return_value = [{'id': 's', 'grade': 0, 'feedback': ''}]
        self.assertEqual(read_results(self.request)['s']['grade'], 0)
        auth.assert_called_once_with(self.request)
        db.assert_called_once_with('/rest/v1/rpc/list_submission_results', 'test-token', {})


if __name__ == '__main__':
    unittest.main()
