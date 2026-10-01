"""Exercise the existing archive endpoint without starting OCR/models/background workers."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
from fastapi import HTTPException


class ArchiveEndpointTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'get_archived_classrooms_endpoint')
        function.decorator_list = []
        self.auth = Mock()
        self.db = Mock(return_value=[{'id': 'A'}])
        namespace = {'Request': object, 'HTTPException': HTTPException, 'authenticated_account': self.auth, 'supabase_request': self.db}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'main.py', 'exec'), namespace)
        self.endpoint = namespace[function.name]
        self.request = SimpleNamespace(state=SimpleNamespace(access_token='caller-session'))

    def test_uses_caller_session_and_scoped_rpc(self):
        self.assertEqual(self.endpoint(self.request), {'success': True, 'archived_ids': ['A']})
        self.auth.assert_called_once_with(self.request)
        self.db.assert_called_once_with('/rest/v1/rpc/list_my_archived_classrooms', 'caller-session', {})

    def test_empty_result_and_invalid_response(self):
        self.db.return_value = []
        self.assertEqual(self.endpoint(self.request)['archived_ids'], [])
        self.db.return_value = None
        with self.assertRaises(HTTPException) as raised:
            self.endpoint(self.request)
        self.assertEqual(raised.exception.status_code, 503)

    def test_authentication_failure_stops_database_request(self):
        self.auth.side_effect = HTTPException(401, 'Sign in')
        with self.assertRaises(HTTPException):
            self.endpoint(self.request)
        self.db.assert_not_called()


if __name__ == '__main__':
    unittest.main()
