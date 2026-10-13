import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from admin_api import install_account_guard
from classroom_settings import router

OWNER = '11111111-1111-4111-8111-111111111111'
CLASS = '22222222-2222-4222-8222-222222222222'


class ClassroomSettingsTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        install_account_guard(app)
        self.client = TestClient(app)
        self.url = f'/api/classrooms/{CLASS}/name'
        self.headers = {'Authorization': 'Bearer caller-jwt'}

    def auth(self, role='teacher', status='active'):
        def upstream(path, token, *args, **kwargs):
            if path == '/auth/v1/user':
                return {'id': OWNER}
            return {'id': OWNER, 'role': role, 'account_status': status}
        return patch('admin_api.supabase_request', side_effect=upstream)

    def test_required_names_never_write(self):
        with self.auth(), patch('classroom_settings.supabase_request') as db:
            for body in ({}, {'name': None}, {'name': ''}, {'name': ' \t\n '}):
                response = self.client.patch(self.url, headers=self.headers, json=body)
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()['detail'], list)
            db.assert_not_called()

    def test_owner_updates_only_name_using_caller_rls(self):
        old = {'id': CLASS, 'classroom_name': 'Old', 'classroom_code': 'ABC123', 'teacher_id': OWNER}
        new = {**old, 'classroom_name': 'CSST 106  Pattern Recognition'}
        with self.auth(), patch('classroom_settings.supabase_request', side_effect=[[old], [new]]) as db:
            response = self.client.patch(self.url, headers=self.headers, json={'name': '  CSST 106  Pattern Recognition  '})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), new)
            update = db.call_args
            self.assertIn(f'id=eq.{CLASS}&teacher_id=eq.{OWNER}', update.args[0])
            self.assertEqual(update.args[1:], ('caller-jwt', {'classroom_name': new['classroom_name']}))
            self.assertEqual(update.kwargs, {'method': 'PATCH'})

    def test_unchanged_name_does_not_write(self):
        with self.auth(), patch('classroom_settings.supabase_request', return_value=[{'classroom_name': 'Old'}]) as db:
            self.assertEqual(self.client.patch(self.url, headers=self.headers, json={'name': ' Old '}).status_code, 200)
            self.assertEqual(db.call_count, 1)

    def test_other_teacher_cannot_update(self):
        with self.auth(), patch('classroom_settings.supabase_request', return_value=[]) as db:
            self.assertEqual(self.client.patch(self.url, headers=self.headers, json={'name': 'New'}).status_code, 403)
            self.assertEqual(db.call_count, 1)

    def test_student_admin_inactive_and_anonymous_denied(self):
        self.assertEqual(self.client.patch(self.url, json={'name': 'New'}).status_code, 401)
        for role, status in [('student', 'active'), ('admin', 'active'), ('teacher', 'inactive')]:
            with self.auth(role, status), patch('classroom_settings.supabase_request') as db:
                self.assertEqual(self.client.patch(self.url, headers=self.headers, json={'name': 'New'}).status_code, 403)
                db.assert_not_called()


if __name__ == '__main__':
    unittest.main()
