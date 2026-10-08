import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi import HTTPException, Request
from classmate_matching import load_classmates, inspect_classmate_pair
from plagiarism_db import compute_peer_similarity


TEXT = 'Students learn by reading carefully and discussing their ideas with other members of the classroom.'
CURRENT = {'id': 'self', 'student_id': 'student-a', 'assignment_id': 'assignment-a', 'classroom_id': 'class-a'}


def peer(sid='peer', student='student-b', classroom='class-a', assignment='assignment-a'):
    return {'id': sid, 'student_id': student, 'classroom_id': classroom, 'assignment_id': assignment,
            'text': TEXT, 'transcribed_text': TEXT, 'student_name': 'Maria Santos'}


class MatchingTests(unittest.TestCase):
    @patch('classmate_matching.supabase_request')
    def test_missing_scope_never_queries_the_database(self, database):
        for key in CURRENT:
            with self.assertRaises(ValueError):
                load_classmates({**CURRENT, key: None}, 'token')
        database.assert_not_called()

    def test_calculator_excludes_self_same_student_other_class_and_assignment(self):
        result = compute_peer_similarity(TEXT, 'self', 'assignment-a', [
            peer(), peer('self'), peer('revision', student='student-a'),
            peer('other-class', classroom='class-b'), peer('other-assignment', assignment='assignment-b')],
            classroom_id='class-a', current_student_id='student-a')
        self.assertEqual(result['total_peers_compared'], 1)
        self.assertEqual(result['all_matches'][0]['student_name'], 'Maria Santos')
        self.assertEqual(result['all_matches'][0]['score_percent'], 100)
        self.assertEqual(result['all_matches'][0]['submission_id'], 'peer')

    def test_all_relevant_matches_are_available_for_pagination(self):
        result = compute_peer_similarity(TEXT, 'self', 'assignment-a', [peer(str(n), str(n)) for n in range(23)],
            classroom_id='class-a', current_student_id='student-a')
        self.assertEqual(len(result['all_matches']), 23)
        unrelated = peer(); unrelated['text'] = 'A different passage describes mountains rivers valleys clouds forests animals plants weather sunshine rain oceans.'
        self.assertFalse(compute_peer_similarity(TEXT, peer_submissions=[unrelated])['all_matches'])

    @patch('classmate_matching.supabase_request')
    def test_database_pages_are_scoped_and_names_only_resolve_scoped_students(self, database):
        database.side_effect = [[peer(), peer('bad', student='outsider', classroom='class-b')], [],
                                [{'id': 'student-b', 'full_name': 'Maria Santos'}]]
        result = load_classmates(CURRENT, 'token')
        self.assertEqual([row['id'] for row in result], ['peer'])
        for call in database.call_args_list[:2]:
            self.assertIn('classroom_id=eq.class-a&assignment_id=eq.assignment-a', call.args[0])
        self.assertIn('offset=2', database.call_args_list[1].args[0])
        self.assertNotIn('outsider', database.call_args_list[2].args[0])
        self.assertIn('&select=id,full_name', database.call_args_list[2].args[0])

    def endpoint(self):
        tree = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'check_peer_plagiarism')
        node.decorator_list = []
        scope = dict(Request=Request, HTTPException=HTTPException,
            require_submission=Mock(return_value=CURRENT), require_assignment=Mock(),
            read_results=Mock(return_value={'self': {'transcribed_text': TEXT}}),
            load_classmates=Mock(return_value=[peer()]),
            inspect_classmate_pair=Mock(return_value={'score_percent': 100}),
            plagiarism_db=SimpleNamespace(compute_peer_similarity=compute_peer_similarity),
            os=SimpleNamespace(environ={'SUPABASE_SERVICE_ROLE_KEY': 'test'}))
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'main.py', 'exec'), scope)
        return scope

    @patch('user_preferences.teacher_preferences', return_value={'peerCrossCheck': True})
    def test_pair_requires_access_to_both_submissions(self, preferences):
        scope = self.endpoint()
        scope['require_submission'].side_effect = [CURRENT, peer()]
        scope['read_results'].return_value = {'self': {**CURRENT, 'transcribed_text': TEXT}, 'peer': peer()}
        request = SimpleNamespace(json=AsyncMock(return_value={'submission_id': 'self', 'assignment_id': 'assignment-a',
            'classroom_id': 'class-a', 'matched_submission_id': 'peer'}))
        self.assertEqual(asyncio.run(scope['check_peer_plagiarism'](request)), {'score_percent': 100})
        self.assertEqual(scope['require_submission'].call_count, 2)
        self.assertTrue(all(call.kwargs['teacher_only'] for call in scope['require_submission'].call_args_list))
        scope['load_classmates'].assert_not_called()

    def test_pair_rejects_self_same_student_foreign_scope_and_unauthorized_peer(self):
        for other in [CURRENT, peer(student='student-a'), peer(classroom='class-b'), peer(assignment='assignment-b'), HTTPException(404, 'Denied')]:
            scope = self.endpoint()
            scope['require_submission'].side_effect = [CURRENT, other]
            request = SimpleNamespace(json=AsyncMock(return_value={'submission_id': 'self', 'assignment_id': 'assignment-a',
                'classroom_id': 'class-a', 'matched_submission_id': 'peer'}))
            with self.assertRaises(HTTPException):
                asyncio.run(scope['check_peer_plagiarism'](request))
            scope['read_results'].assert_not_called()
            scope['inspect_classmate_pair'].assert_not_called()

    @patch('classmate_matching.supabase_request')
    def test_pair_payload_contains_actual_answers_and_no_private_fields(self, database):
        database.side_effect = [[{'id': 'student-a', 'full_name': 'Juan Dela Cruz'}, {'id': 'student-b', 'full_name': 'Maria Santos'}],
            [{'title': 'Essay'}], [{'classroom_name': 'English', 'subject': 'Writing'}]]
        saved = {key: {'transcribed_text': TEXT, 'created_at': '2026-10-08T02:00:00Z', 'status': 'submitted',
            'grade': '90', 'feedback': 'Private', 'email': 'private@example.com'} for key in ['self', 'peer']}
        result = inspect_classmate_pair(CURRENT, peer(), saved, 'token')
        self.assertEqual(result['left']['text'], TEXT)
        self.assertEqual(result['right']['student_name'], 'Maria Santos')
        self.assertEqual(result['score_percent'], 100)
        self.assertTrue(result['matching_snippets'])
        self.assertEqual(set(result['left']), {'submission_id', 'student_name', 'submitted_at', 'status', 'text'})

    @patch('user_preferences.teacher_preferences', return_value={'peerCrossCheck': True})
    def test_endpoint_uses_saved_text_and_authenticated_scope_not_client_peers(self, preferences):
        scope = self.endpoint()
        request = SimpleNamespace(json=AsyncMock(return_value={
            'submission_id': 'self', 'assignment_id': 'assignment-a', 'classroom_id': 'class-a',
            'text': 'forged', 'peer_submissions': [peer('intruder', classroom='elsewhere')]}))
        result = asyncio.run(scope['check_peer_plagiarism'](request))
        self.assertEqual(result['all_matches'][0]['score_percent'], 100)
        self.assertEqual(result['all_matches'][0]['submission_id'], 'peer')
        scope['require_submission'].assert_called_once_with(request, 'self', teacher_only=True)
        scope['require_assignment'].assert_called_once_with(request, 'assignment-a', teacher_only=True)

    def test_endpoint_rejects_mismatched_scope_and_denied_access_before_reading_peers(self):
        scope = self.endpoint()
        request = SimpleNamespace(json=AsyncMock(return_value={'submission_id': 'self',
            'assignment_id': 'assignment-a', 'classroom_id': 'class-b'}))
        with self.assertRaises(HTTPException):
            asyncio.run(scope['check_peer_plagiarism'](request))
        scope['load_classmates'].assert_not_called()
        scope['require_submission'].side_effect = HTTPException(403, 'Teachers only')
        with self.assertRaises(HTTPException):
            asyncio.run(scope['check_peer_plagiarism'](request))
        scope['read_results'].assert_not_called()


if __name__ == '__main__':
    unittest.main()
