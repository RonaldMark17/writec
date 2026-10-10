import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

from essay_pages import (ordered_page_text, read_bundle, transcribe_pages,
                         upload_pages, validate_image, validated_uploads, view_pages, router)
from ocr_regions import reading_order, join_recognized_lines
from submission_intake import ReviewedSubmission, submit_reviewed_work
from submission_worker import SubmissionWorker

STUDENT = '00000000-0000-0000-0000-000000000003'
ASSIGNMENT = '00000000-0000-0000-0000-000000000005'


def image_bytes():
    output = io.BytesIO()
    Image.new('RGB', (12, 12), 'white').save(output, format='PNG')
    return output.getvalue()


def page_file(name='page.png', data=None):
    return UploadFile(filename=name, file=io.BytesIO(image_bytes() if data is None else data))


class EssayPageTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.request = SimpleNamespace(base_url='http://localhost:8000/',
            app=SimpleNamespace(state=SimpleNamespace(upload_root=self.folder.name)))
        self.pages = [{'page_number': i, 'text': text, 'status': 'ready'} for i, text in enumerate(
            ['Paragraph starts here', 'and continues here.\n\nNext paragraph', 'Conclusion'], 1)]
        self.access = patch('essay_pages.require_assignment', return_value={'id': STUDENT, 'role': 'student'}).start()
        self.addCleanup(patch.stopall)

    def upload(self):
        # Deliberately nonalphabetic: the user's preview order is authoritative.
        return upload_pages(self.request, ASSIGNMENT, json.dumps(self.pages),
            [page_file('z.png'), page_file('a.png'), page_file('m.png')])

    def test_originals_and_transcripts_are_one_ordered_reconstructable_file(self):
        result = self.upload()
        archive = next(Path(self.folder.name).rglob('*.essay.zip'))
        manifest, contents = read_bundle(archive.read_bytes())
        self.assertEqual([p['name'] for p in manifest['pages']], ['z.png', 'a.png', 'm.png'])
        self.assertEqual([p['page_number'] for p in manifest['pages']], [1, 2, 3])
        self.assertEqual(result['text'], ordered_page_text(self.pages))
        self.assertEqual(len(contents), 3)
        self.assertTrue(all(p['status'] == 'ready' for p in manifest['pages']))
        self.assertEqual(manifest['student_id'], STUDENT)

    def test_out_of_order_completion_is_combined_by_explicit_page_number(self):
        self.assertEqual(ordered_page_text([self.pages[2], self.pages[0], self.pages[1]]),
            'Paragraph starts here\nand continues here.\n\nNext paragraph\nConclusion')
        with self.assertRaises(ValueError):
            ordered_page_text([self.pages[0], self.pages[0]])

    def test_actual_file_content_and_size_are_validated(self):
        with self.assertRaises(ValueError):
            validate_image(b'<script>not an image</script>')
        with patch.dict('os.environ', {'MAX_IMAGE_SIZE_MB': '0.00001'}):
            with self.assertRaisesRegex(ValueError, 'MB or smaller'):
                validated_uploads([page_file()])
        size = len(image_bytes())
        with patch.dict('os.environ', {'MAX_SUBMISSION_SIZE_MB': str((size * 2 - 1) / 1024**2)}):
            with self.assertRaisesRegex(ValueError, 'total submission'):
                validated_uploads([page_file(), page_file()])
        with patch.dict('os.environ', {'MAX_ESSAY_PAGES': '2'}):
            with self.assertRaises(HTTPException):
                self.upload()

    def test_failed_page_or_invalid_order_never_publishes_a_bundle(self):
        self.pages[1]['status'] = 'failed'
        with self.assertRaises(HTTPException) as error:
            self.upload()
        self.assertIn('Page 2', error.exception.detail)
        self.assertEqual(list(Path(self.folder.name).rglob('*.essay.zip')), [])
        self.pages[1]['status'] = 'ready'
        self.pages.reverse()
        with self.assertRaises(HTTPException):
            self.upload()

    def test_assignment_denial_happens_before_writing_any_page(self):
        self.access.side_effect = HTTPException(403, 'denied')
        with self.assertRaises(HTTPException):
            self.upload()
        self.assertEqual(list(Path(self.folder.name).rglob('*')), [])

    def test_all_pages_finish_before_done_and_failure_has_page_number(self):
        def transcribe(file):
            yield json.dumps({'type': 'done', 'text': file.filename})
        events = list(transcribe_pages([b'one', b'two', b'three'], ['z', 'a', 'm'], transcribe))
        self.assertEqual(events[-1]['text'], 'z\na\nm')
        self.assertEqual(sum(event['type'] == 'done' for event in events), 1)
        def failed(file):
            if file.filename == 'a':
                raise ValueError('Model failed')
            yield json.dumps({'type': 'done', 'text': file.filename})
        events = list(transcribe_pages([b'one', b'two', b'three'], ['z', 'a', 'm'], failed))
        self.assertEqual(events[-1]['type'], 'error')
        self.assertIn('Page 2', events[-1]['detail'])
        self.assertFalse(any(e['type'] == 'done' for e in events))

    def test_view_checks_existing_submission_or_history_permission(self):
        result = self.upload()
        with patch('essay_pages.require_file', side_effect=HTTPException(404)):
            with self.assertRaises(HTTPException):
                view_pages(self.request, result['file_url'], 1)
        key = result['file_url'].split('/uploads/')[1]
        with patch('essay_pages.require_file', return_value=('local', key)):
            self.assertEqual(view_pages(self.request, result['file_url'], 2).body, image_bytes())
            with patch.dict('os.environ', {'MAX_IMAGE_SIZE_MB': '0.00001', 'MAX_ESSAY_PAGES': '1'}):
                self.assertEqual(view_pages(self.request, result['file_url'], 2).body, image_bytes())

    @patch.dict('os.environ', {'SUPABASE_SERVICE_ROLE_KEY': 'test'})
    def test_intake_rejects_incomplete_text_then_worker_checks_complete_essay_once(self):
        result = self.upload()
        body = ReviewedSubmission(assignment_id=ASSIGNMENT, title='Essay', file_url=result['file_url'], text='Only the first page')
        with patch('submission_intake.require_assignment', return_value={'id': STUDENT, 'role': 'student'}), patch('submission_intake.supabase_request') as db:
            with self.assertRaises(HTTPException):
                submit_reviewed_work(body, self.request)
            db.assert_not_called()
            body.text = result['text']
            db.side_effect = lambda path, token, payload=None: [dict(payload)] if payload else [{'classroom_id': 'c'}] if 'assignmentTable' in path else []
            saved = submit_reviewed_work(body, self.request)
            row = db.call_args.args[2]
        checker = Mock(return_value={'score': 0})
        worker = SubmissionWorker(self.folder.name, Mock(), checker, token='test')
        worker.rpc = Mock(return_value=True)
        with patch('submission_worker.supabase_request', return_value=[row]):
            worker.process({'submission_id': saved['id'], 'lease': 'lease', 'checkpoint': {}})
        checker.assert_called_once()
        self.assertEqual(checker.call_args.args[2], result['text'])
        worker.image_ocr.assert_not_called()

    def test_line_reading_order_handles_slightly_misaligned_fragments(self):
        def box(x, y):
            return {'x1': x, 'x2': x + 30, 'y1': y, 'y2': y + 20, 'centroid_y': y + 10}
        boxes = [box(100, 9), box(0, 50), box(0, 11)]
        self.assertEqual([(b['x1'], b['y1']) for b in reading_order(boxes)], [(0, 11), (100, 9), (0, 50)])
        lines = [{'text': 'i wrote THIS,', 'bbox': [0, 0, 100, 20]},
                 {'text': 'my own words', 'bbox': [0, 30, 100, 50]},
                 {'text': 'new paragraph', 'bbox': [0, 100, 100, 120]},
                 {'text': 'continues', 'bbox': [0, 130, 100, 150]}]
        self.assertEqual(join_recognized_lines(lines), 'i wrote THIS,\nmy own words\n\nnew paragraph\ncontinues')

    def test_batch_http_stream_validates_images_before_invoking_the_existing_ocr(self):
        app = FastAPI()
        app.include_router(router)
        def recognize(file):
            yield json.dumps({'type': 'done', 'text': file.filename})
        app.state.transcribe_page_events = Mock(side_effect=recognize)
        client = TestClient(app)
        response = client.post('/api/upload-pages-stream', files=[
            ('files', ('second.png', image_bytes(), 'image/png')),
            ('files', ('first.png', image_bytes(), 'image/png')),
        ])
        self.assertEqual(response.status_code, 200)
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]['text'], 'second.png\nfirst.png')
        self.assertEqual(app.state.transcribe_page_events.call_count, 2)
        app.state.transcribe_page_events.reset_mock()
        response = client.post('/api/upload-pages-stream', files=[('files', ('fake.png', b'not an image', 'image/png'))])
        self.assertEqual(response.status_code, 400)
        app.state.transcribe_page_events.assert_not_called()
