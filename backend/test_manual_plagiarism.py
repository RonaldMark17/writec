"""Execute endpoint bodies without loading unrelated OCR model dependencies."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
import unittest
from unittest.mock import Mock, AsyncMock, patch
from fastapi import HTTPException, File, UploadFile, Request, Query
from copyleaks_service import copyleaks_service


def endpoints():
    tree = ast.parse(Path(__file__).with_name('main.py').read_text())
    names = {'check_plagiarism', 'get_plagiarism_scan', 'save_submission_scan_endpoint', 'copyleaks_webhook', 'simulate_complete_scan'}
    nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    for node in nodes:
        node.decorator_list = []
    scope = dict(HTTPException=HTTPException, File=File, UploadFile=UploadFile, Request=Request,
        Optional=Optional, Query=Query, copyleaks_service=Mock(), plagiarism_db=Mock(),
        authenticated_account=Mock(return_value={'id': 'teacher'}),
        require_scan=Mock(side_effect=lambda request, record: record),
        require_submission=Mock(return_value={'assignment_id': 'assignment'}), save_results=Mock())
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'main.py', 'exec'), scope)
    return scope


class ManualTests(unittest.TestCase):
    def setUp(self):
        self.scope = endpoints()
        self.request = SimpleNamespace(json=AsyncMock(return_value={'text': 'word ' * 25}))

    def test_submission_failure_is_error_without_a_success_record(self):
        self.scope['copyleaks_service'].submit_scan.side_effect = RuntimeError('unavailable')
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.scope['check_plagiarism'](file=None, request=self.request))
        self.assertEqual(error.exception.status_code, 502)
        self.scope['plagiarism_db'].create_scan.assert_not_called()

    def test_delayed_callback_stays_pending_without_polling_or_writes(self):
        row = {'status': 'processing', 'created_at': '2000-01-01T00:00:00+00:00'}
        self.scope['plagiarism_db'].get_scan.return_value = row
        self.assertEqual(self.scope['get_plagiarism_scan']('scan', self.request), row)
        self.scope['plagiarism_db'].update_scan_completed.assert_not_called()
        self.scope['copyleaks_service'].get_scan_results.assert_not_called()

    def test_verified_empty_and_wikipedia_sources_are_preserved(self):
        for sources in ([], [{'url': 'https://en.wikipedia.org/wiki/Essay'}]):
            row = {'status': 'completed', 'plagiarism_score': 0, 'result_data': {'provider': 'copyleaks', 'matched_sources': sources}}
            self.scope['plagiarism_db'].get_scan.return_value = row
            self.assertEqual(self.scope['get_plagiarism_scan']('scan', self.request), row)
        self.scope['plagiarism_db'].update_scan_completed.assert_not_called()

    def test_legacy_completed_report_is_hidden(self):
        self.scope['plagiarism_db'].get_scan.return_value = {'status': 'completed', 'plagiarism_score': 12, 'result_data': {'matched_sources': []}}
        result = self.scope['get_plagiarism_scan']('scan', self.request)
        self.assertEqual(result['status'], 'failed')
        self.assertIsNone(result['result_data'])
        self.assertIsNone(result['plagiarism_score'])

    def test_client_report_cannot_be_saved_without_server_scan(self):
        self.request.json.return_value = {'transcribed_text': 'essay', 'scan_result': {'score': 0}}
        with self.assertRaises(HTTPException):
            asyncio.run(self.scope['save_submission_scan_endpoint']('submission', self.request))
        self.scope['save_results'].assert_not_called()

    def test_client_score_and_sources_are_replaced_with_verified_record(self):
        self.request.json.return_value = {'transcribed_text': 'essay', 'scan_result': {'scanId': 'scan', 'score': 0}}
        self.scope['plagiarism_db'].get_scan.return_value = {'status': 'completed', 'submitted_text': 'essay',
            'result_data': {'provider': 'copyleaks', 'plagiarism_score': 25, 'matched_sources': []}}
        asyncio.run(self.scope['save_submission_scan_endpoint']('submission', self.request))
        saved = self.scope['save_results'].call_args.args[2]['scan_result']
        self.assertEqual(saved['score'], 25)
        self.assertEqual(saved['matchedSources'], [])

    def test_simulation_cannot_create_results(self):
        with self.assertRaises(HTTPException) as error:
            self.scope['simulate_complete_scan']('scan', self.request)
        self.assertEqual(error.exception.status_code, 410)
        self.scope['plagiarism_db'].update_scan_completed.assert_not_called()

    def test_parser_requires_valid_provider_score_and_preserves_all_sources(self):
        for score in (None, 'NaN', -1, 101):
            with self.assertRaises(ValueError):
                copyleaks_service.parse_completed_payload({'results': {'score': {'aggregatedScore': score}}})
        payload = {'scannedDocument': {'scanId': 'scan'}, 'results': {'score': {'aggregatedScore': 0},
            'internet': [{'title': 'Wikipedia', 'url': 'https://en.wikipedia.org/wiki/Essay'}],
            'repositories': [{'title': 'Private repository match'}]}}
        parsed = copyleaks_service.parse_completed_payload(payload)
        self.assertEqual(parsed['plagiarism_score'], 0)
        self.assertEqual(len(parsed['matched_sources']), 2)
        self.assertEqual(parsed['matched_sources'][0]['url'], payload['results']['internet'][0]['url'])
        self.assertEqual(parsed['matched_sources'][1]['url'], '')

    @patch('submission_checker.record_submission_webhook', return_value=False)
    def test_authenticated_callback_saves_provider_report(self, job_callback):
        payload = {'status': 0, 'scannedDocument': {'scanId': 'scan'},
                   'results': {'score': {'aggregatedScore': 0}, 'internet': []}}
        self.request.json.return_value = payload
        self.scope['copyleaks_service'].parse_completed_payload.side_effect = copyleaks_service.parse_completed_payload
        asyncio.run(self.scope['copyleaks_webhook']('completed', self.request))
        saved = self.scope['plagiarism_db'].update_scan_completed.call_args.kwargs
        self.assertEqual(saved['plagiarism_score'], 0)
        self.assertEqual(saved['result_data']['provider'], 'copyleaks')
        self.assertEqual(saved['result_data']['matched_sources'], [])

    def test_unauthenticated_callback_cannot_complete_scan(self):
        self.request.json.return_value = {'scannedDocument': {'scanId': 'scan'}}
        self.scope['copyleaks_service'].verify_webhook.return_value = False
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.scope['copyleaks_webhook']('completed', self.request))
        self.assertEqual(error.exception.status_code, 403)
        self.scope['plagiarism_db'].update_scan_completed.assert_not_called()

    @patch('submission_checker.record_submission_webhook', return_value=False)
    def test_invalid_callback_fails_instead_of_defaulting_to_zero(self, job_callback):
        self.request.json.return_value = {'scannedDocument': {'scanId': 'scan'}, 'results': {}}
        self.scope['copyleaks_service'].parse_completed_payload.side_effect = copyleaks_service.parse_completed_payload
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.scope['copyleaks_webhook']('completed', self.request))
        self.assertEqual(error.exception.status_code, 422)
        self.scope['plagiarism_db'].update_scan_completed.assert_not_called()
        self.scope['plagiarism_db'].update_scan_failed.assert_called_once()
