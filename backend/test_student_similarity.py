import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
from student_similarity import student_similarity

IDENTITY = dict(id='own', student_id='s', classroom_id='c', assignment_id='a')

class StudentSimilarityTests(unittest.TestCase):
    def setUp(self):
        self.request = SimpleNamespace(state=SimpleNamespace(access_token='session'))
        self.state = 'ready'
        self.verified = True
        self.report = {'mode': 'copyleaks', 'score': 24, 'peerSimilarity': {'all_matches': [
            {'submission_id': 'peer', 'score_percent': 68, 'student_name': 'Private name', 'matching_snippets': ['Private text']},
            {'submission_id': 'own', 'score_percent': 100},
            {'submission_id': 'otherclass', 'score_percent': 99},
            {'submission_id': 'otherassignment', 'score_percent': 99},
            {'submission_id': 'samestudent', 'score_percent': 99}]}}
        self.provider = {'results': {'internet': [{'title': 'Actual title', 'url': 'https://example.com/article', 'matchedWords': 12},
            {'url': 'javascript:alert(1)'}]}}
        self.calls = []
        self.patches = [patch('student_similarity.authenticated_account', return_value={'role':'student','id':'s'}),
            patch('student_similarity.require_submission', return_value=IDENTITY),
            patch('student_similarity.require_assignment'),
            patch('student_similarity.supabase_request', side_effect=self.read),
            patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'service'})]
        self.mocks = [p.start() for p in self.patches]
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

    def read(self, path, token, *args):
        self.calls.append(path)
        if 'classroomMembers?' in path: return [{'student_id': 's'}]
        if 'submission_jobs?' in path: return [{'state': self.state, 'provider_result': self.provider}]
        if 'submission_report_verified' in path: return self.verified
        if 'select=scan_result' in path: return [{'scan_result': self.report}]
        for name in ('peer','otherclass','otherassignment','samestudent'):
            if 'id=eq.'+name+'&' in path:
                return [{**IDENTITY, 'id': name, 'student_id': 's' if name == 'samestudent' else 'other',
                    'classroom_id': 'different' if name == 'otherclass' else 'c',
                    'assignment_id': 'different' if name == 'otherassignment' else 'a'}]
        raise AssertionError(path)

    def test_completed_whitelisted_anonymous_result_and_safe_sources(self):
        result = student_similarity(self.request, 'own')
        self.assertEqual(result, {'state': 'ready', 'score': 24, 'mode': 'copyleaks',
            'sources': [{'title':'Actual title','url':'https://example.com/article','domain':'example.com','matched_words':12}],
            'peers':[{'score':68}], 'passages':[]})
        self.mocks[2].assert_called_once_with(self.request, 'a')

    def test_processing_failed_and_unverified_have_no_scores(self):
        for state in ('submitted','processing','failed'):
            self.state = state
            self.assertEqual(student_similarity(self.request, 'own'), {'state':state})
        self.state = 'ready'; self.verified = False
        self.assertEqual(student_similarity(self.request, 'own'), {'state':'unavailable'})

    def test_other_student_and_nonstudent_denied_before_service_reads(self):
        self.mocks[1].return_value = {**IDENTITY, 'student_id':'someoneelse'}
        with self.assertRaises(HTTPException): student_similarity(self.request, 'other')
        self.assertEqual(self.calls, [])
        self.mocks[0].return_value = {'role':'teacher','id':'s'}
        with self.assertRaises(HTTPException): student_similarity(self.request, 'own')
        self.assertEqual(self.calls, [])

    def test_missing_enrollment_denied(self):
        self.mocks[3].return_value = []
        self.mocks[3].side_effect = None
        with self.assertRaises(HTTPException): student_similarity(self.request, 'own')

    def test_classroom_only_never_presents_peer_score_as_external(self):
        self.report['mode'] = 'classroom'
        result = student_similarity(self.request, 'own')
        self.assertIsNone(result['score'])
        self.assertEqual(result['sources'], [])
        self.assertEqual(result['peers'], [{'score':68}])

    def test_zero_and_refresh_preserve_saved_result_without_processing(self):
        self.report['score'] = 0
        first = student_similarity(self.request, 'own')
        self.assertEqual(first['score'], 0)
        self.assertEqual(first, student_similarity(self.request, 'own'))

if __name__ == '__main__': unittest.main()
