import os
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from contact_api import router, _limits
from admin_api import install_account_guard

class ContactTests(unittest.TestCase):
    def setUp(self):
        _limits.clear()
        app = FastAPI(); app.include_router(router); install_account_guard(app)
        self.client = TestClient(app)
        self.body = {'name': 'Alex', 'email': 'alex@example.com', 'subject': 'Help', 'message': 'Please help.'}
        self.env = patch.dict(os.environ, {'CONTACT_RECIPIENT_EMAIL': 'office@example.com', 'SMTP_HOST': 'smtp.test', 'SMTP_FROM': 'sender@example.com'})
        self.env.start(); self.addCleanup(self.env.stop)

    @patch('contact_api.send_email')
    def test_public_form_sends_only_to_configured_recipient(self, send):
        response = self.client.post('/api/contact', json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(send.call_args.args[0], 'office@example.com')
        self.assertEqual(send.call_args.kwargs['reply_to'], 'alex@example.com')
        with patch.dict(os.environ, {'CONTACT_RECIPIENT_EMAIL': 'new@example.com'}):
            self.client.post('/api/contact', json=self.body)
        self.assertEqual(send.call_args.args[0], 'new@example.com')

    @patch('contact_api.send_email')
    def test_invalid_empty_and_injected_email_never_send(self, send):
        for field, value in [('name', '  '), ('message', ''), ('email', 'invalid'), ('email', 'x@test.com\r\nBcc: other@test.com')]:
            self.assertEqual(self.client.post('/api/contact', json={**self.body, field: value}).status_code, 422)
        send.assert_not_called()

    @patch('contact_api.send_email', side_effect=RuntimeError('smtp-password-must-not-leak'))
    def test_delivery_failure_and_unconfigured_recipient(self, send):
        response = self.client.post('/api/contact', json=self.body)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('smtp-password', response.text)
        with patch.dict(os.environ, {'CONTACT_RECIPIENT_EMAIL': ''}):
            self.assertEqual(self.client.post('/api/contact', json=self.body).status_code, 503)

    @patch('contact_api.send_email')
    def test_repeated_posts_are_limited(self, send):
        for _ in range(5): self.assertEqual(self.client.post('/api/contact', json=self.body).status_code, 200)
        self.assertEqual(self.client.post('/api/contact', json=self.body).status_code, 429)
        self.assertEqual(send.call_count, 5)
