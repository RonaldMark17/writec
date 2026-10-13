import base64
import unittest
import json
from pathlib import Path
from unittest.mock import patch, Mock
from fastapi import FastAPI, BackgroundTasks
from fastapi.testclient import TestClient
from match_evidence import router, compact_artifact, attach_evidence, queue_missing_evidence, export_saved_evidence
from admin_api import install_account_guard
from copyleaks_service import CopyleaksService

JOB = '00000000-0000-0000-0000-000000000001'
SCAN = 'j' + JOB.replace('-', '')


class EvidenceTests(unittest.TestCase):
    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('match_evidence.supabase_request', return_value=[{'id': JOB}])
    def test_expired_or_failed_exports_can_recover_with_atomic_bounded_claims(self, db):
        from datetime import datetime, timezone
        for state in ('requested', 'unavailable'):
            job = {'id': JOB, 'state': 'ready', 'checkpoint': {
                'evidence_export': state, 'evidence_exported_at': '2020-01-01T00:00:00+00:00'}}
            tasks = BackgroundTasks()
            queue_missing_evidence(job, [{'id': 'arbitrary-source'}], tasks)
            self.assertEqual(len(tasks.tasks), 1)
            self.assertIn('checkpoint->>evidence_exported_at=eq.', db.call_args.args[0])
            self.assertEqual(job['checkpoint']['evidence_export_attempts'], 1)
            queue_missing_evidence(job, [{'id': 'arbitrary-source'}], tasks)
            self.assertEqual(len(tasks.tasks), 1)
        for checkpoint in ({'evidence_export': 'ready'},
                           {'evidence_export': 'unavailable', 'evidence_export_attempts': 3},
                           {'evidence_export': 'requested', 'evidence_exported_at': datetime.now(timezone.utc).isoformat()}):
            tasks = BackgroundTasks()
            queue_missing_evidence({'id': JOB, 'state': 'ready', 'checkpoint': checkpoint}, [{'id': 'r'}], tasks)
            self.assertFalse(tasks.tasks)

    def test_arbitrary_scores_sources_and_texts_never_share_ranges(self):
        for number, score in enumerate((5, 42, 100)):
            text = f'Document {number}: exact passage.'
            source = f'arbitrary-{number}'
            report = {'score': score, 'transcribedText': text, 'matchedSources': [{'id': source}, {'id': 'second'}]}
            evidence = {'crawled': {'text': text}, source: {'ranges': [{'start': 0, 'end': 10, 'kind': 'identical'}]},
                        'second': {'ranges': [{'start': 12, 'end': 25, 'kind': 'relatedMeaning'}]},
                        'foreign-source': {'ranges': [{'start': 0, 'end': 999, 'kind': 'identical'}]}}
            attached = attach_evidence(report, evidence)
            self.assertEqual(attached['score'], score)
            self.assertEqual(attached['evidenceStatus'], 'ready')
            self.assertEqual(attached['matchedSources'][0]['matching_fragments'][0]['matched_text'], text[:10])
            self.assertEqual(len(attached['matchedSources']), 2)

    def test_real_75_2_result_projects_all_three_student_side_match_types(self):
        fixture = json.loads((Path(__file__).resolve().parents[1] / 'src/pages/dashboard/__fixtures__/copyleaks-75-2.json').read_text())
        source = fixture['source']
        artifacts = {'crawled': compact_artifact('crawled', {'text': {'value': fixture['text']}}),
                     source['id']: compact_artifact(source['id'], {'text': {'comparison': fixture['comparison']}})}
        report = attach_evidence({**fixture['report'], 'matchedSources': [{
            'id': source['id'], 'title': source['title'], 'url': source['url'], 'matched_words': source['matchedWords']}]}, artifacts)
        self.assertEqual(report, fixture['report'])
        fragments = report['matchedSources'][0]['matching_fragments']
        self.assertEqual(len(fragments), 25)
        self.assertEqual({f['match_kind'] for f in fragments}, {'identical', 'minorChanges', 'relatedMeaning'})
        for fragment in fragments:
            self.assertEqual(fixture['text'][fragment['start']:fragment['end']], fragment['matched_text'])
        self.assertEqual(next(f['matched_text'] for f in fragments if f['start'] == 167),
                         'The frequent\nincidences of similarity, plagiarism, and retraction')
        self.assertTrue(next(f['matched_text'] for f in fragments if f['start'] == 15).startswith('Turnitin:'))

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('match_evidence.supabase_request')
    @patch('match_evidence.copyleaks_service.verify_webhook')
    def test_real_account_guard_allows_signed_evidence_but_not_unsigned_callbacks(self, verify, db):
        app = FastAPI(); app.include_router(router); install_account_guard(app)
        client = TestClient(app)
        verify.return_value = False
        self.assertEqual(client.post(f'/api/plagiarism/evidence/{SCAN}/r', json={}).status_code, 403)
        db.assert_not_called()
        verify.return_value = True
        db.side_effect = [[{'provider_result': {'scannedDocument': {'scanId': SCAN},
                           'results': {'internet': [{'id': 'r'}]}}}], True]
        self.assertEqual(client.post(f'/api/plagiarism/evidence/{SCAN}/r',
            headers={'x-writecheck-evidence': 'signed'}, json={'text': {'comparison': {}}}).status_code, 200)
        self.assertEqual(client.get('/api/submissions/status').status_code, 401)
        self.assertEqual(client.get(f'/api/plagiarism/evidence/{SCAN}/r').status_code, 401)

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})
    @patch('match_evidence.supabase_request', return_value=[{'id': JOB}])
    def test_missing_historical_evidence_is_claimed_once_without_rescanning(self, db):
        job = {'id': JOB, 'state': 'ready', 'checkpoint': {'text': 'Canonical essay'}}
        tasks = BackgroundTasks()
        queue_missing_evidence(job, [{'id': 'r'}], tasks)
        queue_missing_evidence(job, [{'id': 'r'}], tasks)
        self.assertEqual(len(tasks.tasks), 1)
        db.assert_called_once()
        self.assertIn('checkpoint->>evidence_export=is.null', db.call_args.args[0])
        self.assertEqual(job['checkpoint']['text'], 'Canonical essay')
        db.return_value = []  # Another status request already won the claim.
        other_tasks = BackgroundTasks()
        queue_missing_evidence({'id': JOB, 'state': 'ready'}, [{'id': 'r'}], other_tasks)
        self.assertFalse(other_tasks.tasks)

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service', 'COPYLEAKS_WEBHOOK_BASE_URL': 'https://backend.example'})
    @patch('match_evidence.supabase_request')
    @patch('match_evidence.copyleaks_service')
    def test_export_failure_is_persisted_without_changing_summary_or_rescanning(self, service, db):
        service.export_match_evidence.side_effect = RuntimeError('Provider unavailable')
        export_saved_evidence(JOB, [{'id': 'r'}], {'text': 'Essay', 'evidence_export': 'requested'})
        service.submit_scan.assert_not_called()
        self.assertEqual(db.call_args.args[2], {'checkpoint': {'text': 'Essay', 'evidence_export': 'unavailable'}})

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

    def test_projection_rejects_invalid_ranges_instead_of_clipping(self):
        report = {'transcribedText': 'Exact text', 'matchedSources': [{'id': 'r'}]}
        artifacts = {'crawled': {'text': 'Exact text'}, 'r': {'ranges': [
            {'start': start, 'end': end, 'kind': 'identical'}
            for start, end in [(-1, 3), (0, 999), (3, 3), (5, 2), (True, 3)]
        ]}}
        self.assertEqual(attach_evidence(report, artifacts)['matchedSources'][0]['matching_fragments'], [])

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
        first_url = post.call_args.args[0]
        service.export_match_evidence(SCAN, [{'id': 'r'}], 'https://backend.example')
        self.assertNotEqual(first_url, post.call_args.args[0])

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
