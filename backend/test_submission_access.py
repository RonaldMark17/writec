import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
from fastapi import HTTPException
import submission_access as access


class SubmissionAccessTests(unittest.TestCase):
    def setUp(self):
        self.request = SimpleNamespace(state=SimpleNamespace(access_token='test'))
        self.student = {'id': 's1', 'role': 'student'}
        self.row = {'id': 'sub1', 'student_id': 's1', 'assignment_id': 'a1', 'file_url': 'http://localhost:8000/uploads/submissions/s1/a1/essay.txt'}

    def test_student_reads_own_but_cannot_grade(self):
        with patch.object(access, 'authenticated_account', return_value=self.student), patch.object(access, 'supabase_request', return_value=[self.row]):
            self.assertEqual(access.require_submission(self.request, 'sub1'), self.row)
            with self.assertRaises(HTTPException): access.require_submission(self.request, 'sub2')
            with self.assertRaises(HTTPException): access.require_submission(self.request, 'sub1', True)

    def test_teacher_cannot_grade_another_class(self):
        with patch.object(access, 'authenticated_account', return_value={'id': 't1', 'role': 'teacher'}), patch.object(access, 'supabase_request', return_value=[self.row]):
            self.assertEqual(access.require_submission(self.request, 'sub1', True), self.row)
            with self.assertRaises(HTTPException): access.require_submission(self.request, 'other', True)

    def test_file_requires_exact_reference_not_basename(self):
        with patch.object(access, 'authenticated_account', return_value=self.student), patch.object(access, 'supabase_request', return_value=[self.row]):
            self.assertEqual(access.require_file(self.request, '/uploads/submissions/s1/a1/essay.txt')[0], 'local')
            for name in ['/uploads/essay.txt', '/uploads/submissions/s2/a1/essay.txt']:
                with self.assertRaises(HTTPException): access.require_file(self.request, name)

    def test_traversal_rejected(self):
        for name in ['../.env', '/uploads/%2e%2e/.env', '/uploads/a\\b', 'C:/private/file', '/uploads/a/../b']:
            with self.assertRaises(HTTPException): access.file_reference(name)
        with self.assertRaises(HTTPException): access.local_file(Path.cwd(), '../outside')

    def test_scan_owner_only(self):
        with patch.object(access, 'authenticated_account', return_value=self.student):
            self.assertEqual(access.require_scan(self.request, {'user_id': 's1'})['user_id'], 's1')
            for record in [None, {'user_id': 's2'}, {'user_id': 'anonymous'}]:
                with self.assertRaises(HTTPException): access.require_scan(self.request, record)

    def test_assignment_requires_database_approval(self):
        with patch.object(access, 'authenticated_account', return_value=self.student), patch.object(access, 'supabase_request', return_value=False):
            with self.assertRaises(HTTPException): access.require_assignment(self.request, 'a2')

    def test_webhook_proof_is_bound_to_scan(self):
        from copyleaks_service import CopyleaksService
        with patch.dict('os.environ', {'COPYLEAKS_WEBHOOK_SECRET': 'test-only-secret'}):
            service = CopyleaksService()
            proof = service.webhook_token('scan1')
            self.assertTrue(service.verify_webhook('scan1', proof))
            self.assertFalse(service.verify_webhook('scan2', proof))
            self.assertFalse(service.verify_webhook('scan1', 's1'))


if __name__ == '__main__': unittest.main()
