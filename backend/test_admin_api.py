import unittest
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from admin_api import router, install_account_guard, supabase_headers


class AdminApiTests(unittest.TestCase):
    def test_server_secret_does_not_replace_user_identity(self):
        with patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'sb_secret_test',
                                      'SUPABASE_ANON_KEY': 'public-test-key'}):
            self.assertEqual(supabase_headers('sb_secret_test'), {'apikey': 'sb_secret_test'})
            for token in ['user-jwt', 'legacy-service-jwt', 'sb_secret_unconfigured']:
                self.assertEqual(supabase_headers(token), {
                    'apikey': 'public-test-key', 'Authorization': 'Bearer ' + token})

    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        install_account_guard(app)

        @app.post('/upload')
        def upload():
            return {'ok': True}

        self.client = TestClient(app)
        self.headers = {'Authorization': 'Bearer verified-test-token'}

    def upstream(self, role='admin', status='active'):
        def request(path, token, payload=None):
            if path == '/auth/v1/user':
                return {'id': 'u1', 'user_metadata': {'role': 'admin'}}
            if path.endswith('/current_account'):
                return {'id': 'u1', 'role': role, 'account_status': status}
            return {'items': [], 'total': 0}
        return request

    def test_missing_token_rejected(self):
        self.assertEqual(self.client.get('/api/admin/users').status_code, 401)

    def test_forged_token_rejected(self):
        with patch('admin_api.supabase_request', side_effect=HTTPException(401, 'Invalid token')):
            self.assertEqual(self.client.get('/api/admin/users', headers=self.headers).status_code, 401)

    def test_student_and_teacher_rejected_even_with_admin_metadata(self):
        for role in ('student', 'teacher'):
            with patch('admin_api.supabase_request', side_effect=self.upstream(role)):
                self.assertEqual(self.client.get('/api/admin/users', headers=self.headers).status_code, 403)
                self.assertEqual(self.client.patch('/api/admin/users/u2/status', headers=self.headers, json={'status': 'inactive'}).status_code, 403)

    def test_admin_can_read_and_change_status(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream()) as request:
            self.assertEqual(self.client.get('/api/admin/users?search=Alex&role=student&status=active&page=2', headers=self.headers).status_code, 200)
            self.assertEqual(request.call_args.args[2]['filters']['page'], 2)
            response = self.client.patch('/api/admin/users/u2/status', headers=self.headers, json={'status': 'inactive'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(request.call_args.args[2], {'target_user_id': 'u2', 'new_status': 'inactive'})

    def test_inactive_user_rejected_on_existing_backend(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream('student', 'inactive')):
            self.assertEqual(self.client.post('/upload', headers=self.headers).status_code, 403)

    def test_active_student_can_use_existing_backend(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream('student')):
            self.assertEqual(self.client.post('/upload', headers=self.headers).status_code, 200)

    def test_admin_cannot_act_as_teacher_or_student(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream()):
            self.assertEqual(self.client.post('/upload', headers=self.headers).status_code, 403)

    def test_invalid_status_and_date_rejected(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream()):
            self.assertEqual(self.client.patch('/api/admin/users/u2/status', headers=self.headers, json={'status': 'deleted'}).status_code, 422)
            self.assertEqual(self.client.get('/api/admin/activity-logs?date=bad', headers=self.headers).status_code, 422)


if __name__ == '__main__':
    unittest.main()
