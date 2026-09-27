import unittest
from unittest.mock import Mock, patch

from submission_checker import check_submission, normalize_provider, record_submission_webhook


@patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'test-service',
    'SUBMISSION_SIMILARITY_MODE': 'copyleaks', 'COPYLEAKS_WEBHOOK_BASE_URL': 'https://backend.example.com'})
class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.job = {'id': '00000000-0000-0000-0000-000000000010', 'submission_id': 'submission'}
        self.submission = {'assignment_id': 'assignment'}
        self.text = ' '.join(['Reviewed student essay content'] * 6)
        self.service = patch('submission_checker.copyleaks_service').start()
        self.service.is_sandbox = False
        self.db = patch('submission_checker.supabase_request').start()
        self.peer = patch('submission_checker.compute_peer_similarity', return_value={'peer_similarity_score': 0}).start()
        self.preferences = patch('submission_checker.teacher_preferences', return_value={
            'plagiarismSensitivity': 'standard', 'peerCrossCheck': True}).start()
        self.addCleanup(patch.stopall)

    def test_real_callback_score_and_sources_are_preserved_with_scan_identity(self):
        self.db.side_effect = [[{'provider_result': {
            'scannedDocument': {'totalWords': 24, 'scanId': 'j00000000000000000000000000000010'},
            'results': {'score': {'aggregatedScore': 37.5, 'identicalWords': 9},
                        'internet': [{'title': 'Matched source', 'url': 'https://example.com/article'}]},
        }}], []]
        result = check_submission(self.job, self.submission, self.text, {}, Mock())
        self.assertEqual(result['score'], 37.5)
        self.assertEqual(result['provider'], 'copyleaks')
        self.assertEqual(result['scanId'], 'j00000000000000000000000000000010')
        self.assertEqual(result['matchedSources'][0]['url'], 'https://example.com/article')
        self.assertEqual(self.service.submit_scan.call_args.kwargs['text'], self.text)
        self.assertIs(self.service.submit_scan.call_args.kwargs['sandbox'], False)

    def test_provider_error_is_not_replaced_by_local_or_zero_score(self):
        self.service.submit_scan.side_effect = RuntimeError('API unavailable')
        with self.assertRaisesRegex(RuntimeError, 'API unavailable'):
            check_submission(self.job, self.submission, self.text, {}, Mock())
        self.db.assert_not_called()
        self.peer.assert_not_called()

    def test_disabled_peers_are_not_queried_or_shown_as_zero(self):
        self.preferences.return_value = {'plagiarismSensitivity': 'strict', 'peerCrossCheck': False}
        self.job['provider_result'] = {'scannedDocument': {'scanId': 'j00000000000000000000000000000010'},
                                      'results': {'score': {'aggregatedScore': 7}}}
        result = check_submission(self.job, self.submission, self.text, {}, Mock())
        self.peer.assert_not_called()
        self.db.assert_not_called()
        self.assertIsNone(result['peerScore'])
        self.assertEqual(result['tone'], 'amber')
        self.assertEqual(result['score'], 7)

    @patch.dict('os.environ', {'SUBMISSION_SIMILARITY_MODE': 'classroom'})
    def test_classroom_only_mode_cannot_succeed_with_peer_checks_disabled(self):
        self.preferences.return_value = {'plagiarismSensitivity': 'standard', 'peerCrossCheck': False}
        with self.assertRaisesRegex(ValueError, 'requires peer comparison'):
            check_submission(self.job, self.submission, self.text, {}, Mock())

    def test_old_checkpoint_estimate_cannot_skip_the_provider(self):
        self.service.submit_scan.side_effect = RuntimeError('Provider must run')
        with self.assertRaisesRegex(RuntimeError, 'Provider must run'):
            check_submission(self.job, self.submission, self.text,
                {'mode': 'copyleaks', 'provider': {'score': 1.6}}, Mock())
        self.peer.assert_not_called()

    def test_callback_preserves_the_actionable_credit_error(self):
        self.db.return_value = [{'id': self.job['id']}]
        self.assertTrue(record_submission_webhook('j00000000000000000000000000000010', 'error',
            {'error': {'id': 'insufficient_credits', 'message': 'Not enough credits.'}}))
        saved = self.db.call_args.args[2]['provider_error']
        self.assertIn('insufficient_credits', saved)
        self.assertIn('Not enough credits.', saved)

    @patch('submission_checker.time.monotonic', side_effect=[0, 601])
    def test_no_callback_reports_timeout_instead_of_success(self, clock):
        with self.assertRaisesRegex(ValueError, 'have not arrived'):
            check_submission(self.job, self.submission, self.text, {}, Mock())
        self.peer.assert_not_called()

    def test_sandbox_cannot_be_reported_as_real_api_result(self):
        self.service.is_sandbox = True
        with self.assertRaisesRegex(ValueError, 'sandbox results are simulated'):
            check_submission(self.job, self.submission, self.text, {}, Mock())
        self.service.submit_scan.assert_not_called()

    def test_zero_is_valid_but_missing_or_invalid_provider_scores_are_rejected(self):
        self.assertEqual(normalize_provider({'results': {'score': {'aggregatedScore': 0}}})['score'], 0)
        for score in [None, 'nan', -1, 101, 'not-a-score']:
            with self.assertRaises(ValueError):
                normalize_provider({'results': {'score': {'aggregatedScore': score}}})
        with self.assertRaises(ValueError):
            normalize_provider({'results': {}})


if __name__ == '__main__':
    unittest.main()
