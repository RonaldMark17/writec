import unittest
import io
import urllib.error
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from admin_api import router, install_account_guard, supabase_headers, supabase_request


class AdminApiTests(unittest.TestCase):
    def test_duplicate_auth_account_returns_safe_actionable_error(self):
        error = urllib.error.HTTPError('https://example.test', 422, 'Rejected', {},
            io.BytesIO(b'{"error_code":"email_exists","msg":"upstream secret"}'))
        with patch('urllib.request.urlopen', side_effect=error), self.assertRaises(HTTPException) as caught:
            supabase_request('/auth/v1/admin/users', 'test-service', {'email': 'x@school.edu.ph'})
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn('already registered', caught.exception.detail)
        self.assertNotIn('upstream secret', caught.exception.detail)

    def test_create_account_is_admin_only(self):
        body = {'full_name': 'New Student', 'email': 'new@school.edu.ph', 'password': 'test-password', 'role': 'student'}
        self.assertEqual(self.client.post('/api/admin/users', json=body).status_code, 401)
        for role, status in [('student', 'active'), ('teacher', 'active'), ('admin', 'pending'), ('admin', 'inactive')]:
            with patch('admin_api.supabase_request', side_effect=self.upstream(role, status)) as upstream:
                self.assertEqual(self.client.post('/api/admin/users', headers=self.headers, json=body).status_code, 403)
                self.assertFalse(any(call.args[0] == '/auth/v1/admin/users' for call in upstream.call_args_list))

    def test_create_both_roles_preserves_admin_identity_and_hides_password(self):
        for role in ('student', 'teacher'):
            calls = []
            def upstream(path, token, payload=None):
                calls.append((path, token, payload))
                if path == '/auth/v1/admin/users':
                    return {'id': 'new-user'}
                if path.endswith('/admin_set_account_status'):
                    return {'id': 'new-user', 'account_status': 'active'}
                return self.upstream()(path, token, payload)
            with patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'server-only'}), patch('admin_api.supabase_request', side_effect=upstream):
                response = self.client.post('/api/admin/users', headers=self.headers, json={
                    'full_name': ' New Name ', 'email': 'New@SCHOOL.EDU.PH', 'password': 'test-password', 'role': role})
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()['account_status'], 'active')
            self.assertNotIn('test-password', response.text)
            creation = next(call for call in calls if call[0] == '/auth/v1/admin/users')
            self.assertEqual(creation[1], 'server-only')
            self.assertEqual(creation[2]['user_metadata'], {'full_name': 'New Name', 'role': role})
            self.assertEqual(creation[2]['email'], 'new@school.edu.ph')
            self.assertEqual(calls[-1][1], 'verified-test-token')

    def test_create_validation_and_missing_service_key(self):
        body = {'full_name': 'Name', 'email': 'new@edu.com.ph', 'password': 'test-password', 'role': 'student'}
        with patch('admin_api.supabase_request', side_effect=self.upstream()) as upstream:
            for change in [{'role': 'admin'}, {'email': 'x@school.edu.ph.evil.com'}, {'password': 'short'}, {'full_name': ' '}]:
                self.assertEqual(self.client.post('/api/admin/users', headers=self.headers, json={**body, **change}).status_code, 422)
            with patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': ''}):
                self.assertEqual(self.client.post('/api/admin/users', headers=self.headers, json=body).status_code, 503)
            self.assertFalse(any(call.args[0] == '/auth/v1/admin/users' for call in upstream.call_args_list))

    def test_create_partial_failure_does_not_report_no_account_or_retry(self):
        def upstream(path, token, payload=None):
            if path == '/auth/v1/admin/users':
                return {'id': 'new-user'}
            if path.endswith('/admin_set_account_status'):
                raise HTTPException(502, 'Unavailable')
            return self.upstream()(path, token, payload)
        with patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'server-only'}), patch('admin_api.supabase_request', side_effect=upstream):
            response = self.client.post('/api/admin/users', headers=self.headers, json={
                'full_name': 'Name', 'email': 'new@edu.com.ph', 'password': 'test-password', 'role': 'teacher'})
        self.assertEqual(response.status_code, 201)
        self.assertIn('Do not create it again', response.json()['warning'])

    def test_dashboard_counts_all_pending_not_only_recent_registrations(self):
        def upstream(path, token, payload=None):
            if path.endswith('/admin_read'):
                return {'total': 31} if payload['section'] == 'users' else {'recent_users': []}
            return self.upstream()(path, token, payload)
        with patch('admin_api.supabase_request', side_effect=upstream):
            self.assertEqual(self.client.get('/api/admin/dashboard', headers=self.headers).json()['pending'], 31)

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

    def test_pending_and_rejected_accounts_cannot_use_existing_apis(self):
        for status in ('pending', 'rejected'):
            for role in ('student', 'teacher'):
                with patch('admin_api.supabase_request', side_effect=self.upstream(role, status)):
                    response = self.client.post('/upload', headers=self.headers)
                    self.assertEqual(response.status_code, 403)
                    self.assertIn('approval' if status == 'pending' else 'rejected', response.text)

    def test_admin_can_filter_pending_accounts_and_reject_registration(self):
        with patch('admin_api.supabase_request', side_effect=self.upstream()) as request:
            self.assertEqual(self.client.get('/api/admin/users?status=pending&role=teacher', headers=self.headers).status_code, 200)
            self.assertEqual(request.call_args.args[2]['filters']['status'], 'pending')
            self.assertEqual(self.client.patch('/api/admin/users/u2/status', headers=self.headers, json={'status': 'rejected'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
