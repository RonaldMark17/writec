import base64
import unittest
from unittest.mock import patch, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from match_evidence import router, compact_artifact, attach_evidence
from copyleaks_service import CopyleaksService

JOB = '00000000-0000-0000-0000-000000000001'
SCAN = 'j' + JOB.replace('-', '')


class EvidenceTests(unittest.TestCase):
    def test_stores_only_original_text_coordinates_not_html_or_other_essay(self):
        body = {'html': {'value': '<script>bad</script>'}, 'text': {'value': 'Other essay', 'comparison': {
            'identical': {'source': {'chars': {'starts': [2, -1, 9], 'lengths': [4, 8, 0]}},
                          'suspected': {'chars': {'starts': [900], 'lengths': [4]}}}}}}
        self.assertEqual(compact_artifact('result', body), {'ranges': [{'start': 2, 'end': 6, 'kind': 'identical'}]})

    def test_projection_handles_utf16_and_text_versions(self):
        text = '😀 Exact phrase.'
        artifacts = {'crawled': {'text': text}, 'r': {'ranges': [{'start': 3, 'end': 15, 'kind': 'identical'}]}}
        report = {'transcribedText': text, 'matchedSources': [{'id': 'r', 'title': 'Actual source'}]}
        fragment = attach_evidence(report, artifacts)['matchedSources'][0]['matching_fragments'][0]
        self.assertEqual(fragment, {'start': 3, 'end': 15, 'matched_text': 'Exact phrase', 'match_kind': 'identical'})
        report['transcribedText'] = '\n' + text
        fragment = attach_evidence(report, artifacts)['matchedSources'][0]['matching_fragments'][0]
        self.assertNotIn('start', fragment)
        self.assertEqual(fragment['matched_text'], 'Exact phrase')

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('match_evidence.supabase_request')
    @patch('match_evidence.copyleaks_service.verify_webhook')
    def test_callbacks_require_signature_current_scan_and_known_result(self, verify, db):
        app = FastAPI(); app.include_router(router)
        client = TestClient(app)
        verify.return_value = False
        self.assertEqual(client.post(f'/api/plagiarism/evidence/{SCAN}/r', json={}).status_code, 403)
        db.assert_not_called()
        verify.return_value = True
        db.return_value = []
        self.assertEqual(client.post(f'/api/plagiarism/evidence/{SCAN}/r', json={}).status_code, 404)
        db.return_value = [{'id': JOB, 'provider_result': {'scannedDocument': {'scanId': SCAN}, 'results': {'internet': [{'id': 'r'}]}}}]
        self.assertEqual(client.post(f'/api/plagiarism/evidence/{SCAN}/unknown', json={}).status_code, 404)
        response = client.post(f'/api/plagiarism/evidence/{SCAN}/r', json={'text': {'comparison': {}}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(db.call_args.args[2], {'job_key': JOB, 'artifact_key': 'r', 'artifact_data': {'ranges': []}})

    @patch('copyleaks_service.requests.post')
    def test_exports_existing_scan_with_signed_callbacks_without_scan_submission(self, post):
        service = CopyleaksService()
        service.get_access_token = Mock(return_value='access')
        service.webhook_token = Mock(return_value='signature')
        service.export_match_evidence(SCAN, [{'id': 'r'}, {'id': 'r'}], 'https://backend.example')
        self.assertIn('/downloads/' + SCAN + '/export/', post.call_args.args[0])
        body = post.call_args.kwargs['json']
        self.assertEqual(len(body['results']), 1)
        self.assertEqual(body['results'][0]['headers'], [['x-writecheck-evidence', 'signature']])
        self.assertNotIn('base64', body)

    @patch('copyleaks_service.requests.put')
    def test_submission_preserves_canonical_whitespace(self, put):
        service = CopyleaksService()
        service.get_access_token = Mock(return_value='access')
        service.webhook_token = Mock(return_value='signature')
        put.return_value.status_code = 201
        text = '\n  Exact scanned text.\n\n'
        service.submit_scan(text=text, scan_id=SCAN, webhook_base='https://backend.example', sandbox=False)
        self.assertEqual(base64.b64decode(put.call_args.kwargs['json']['base64']).decode(), text)


if __name__ == '__main__':
    unittest.main()
