import io
import unittest
import zipfile
from unittest.mock import Mock, patch

from document_text import extract_document
from submission_worker import SubmissionWorker
from submission_checker import normalize_provider
from copyleaks_service import CopyleaksService


class DocumentTests(unittest.TestCase):
    def test_text_and_image_use_real_content(self):
        ocr = Mock(return_value='Handwritten content')
        self.assertEqual(extract_document(b'Essay contents', 'essay.txt', ocr), 'Essay contents')
        self.assertEqual(extract_document(b'image', 'essay.png', ocr), 'Handwritten content')
        ocr.assert_called_once_with(b'image', 'essay.png')

    def test_docx_extracts_paragraphs_not_zip_bytes(self):
        document = io.BytesIO()
        with zipfile.ZipFile(document, 'w') as archive:
            archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First paragraph</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(extract_document(document.getvalue(), 'essay.docx', Mock()), 'First paragraph\nSecond paragraph')

    def test_empty_or_unsupported_files_fail_without_placeholder_essay(self):
        for content, name in [(b'', 'empty.txt'), (b'binary', 'old.doc'), (b'  ', 'blank.txt')]:
            with self.assertRaises(ValueError):
                extract_document(content, name, Mock())

    def test_image_only_pdf_uses_ocr(self):
        from PIL import Image
        document = io.BytesIO()
        Image.new('RGB', (20, 20), 'white').save(document, format='PDF')
        ocr = Mock(return_value='Text extracted from a scanned PDF')
        self.assertEqual(extract_document(document.getvalue(), 'scan.pdf', ocr), 'Text extracted from a scanned PDF')
        ocr.assert_called_once()

    def test_unreadable_pdf_page_fails_instead_of_omitting_it(self):
        from pypdf import PdfWriter
        document = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(document)
        with self.assertRaisesRegex(ValueError, 'PDF page'):
            extract_document(document.getvalue(), 'blank.pdf', Mock())

    def test_provider_zero_is_valid_but_absent_score_is_not(self):
        self.assertEqual(normalize_provider({'results': {'score': {'aggregatedScore': 0}}})['score'], 0)
        with self.assertRaises(ValueError):
            normalize_provider({'results': {}})

    @patch('copyleaks_service.requests.put')
    @patch.object(CopyleaksService, 'get_access_token', return_value='test-token')
    def test_external_retry_reuses_id_and_accepts_existing_scan(self, token, put):
        put.return_value = Mock(status_code=409)
        with patch.dict('os.environ', {'COPYLEAKS_WEBHOOK_SECRET': 'test-secret'}):
            result = CopyleaksService().submit_scan(text='essay', scan_id='stable-id',
                webhook_base='https://example.com', sandbox=False)
        self.assertEqual(result['scan_id'], 'stable-id')
        self.assertTrue(put.call_args.args[0].endswith('/stable-id'))


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.checker = Mock(return_value={'score': 20})
        self.worker = SubmissionWorker('.', Mock(), self.checker, token='test-service')
        self.job = {'submission_id': 's', 'id': 'j', 'lease': 'lease', 'checkpoint': {'text': 'Persisted OCR'}}
        self.worker.rpc = Mock(return_value=True)

    @patch('submission_worker.supabase_request', return_value=[{'id': 's', 'assignment_id': 'a'}])
    def test_restart_reuses_checkpoint_and_confirms_finish(self, db):
        self.worker.process(self.job)
        self.worker.image_ocr.assert_not_called()
        self.assertEqual(self.checker.call_args.args[2], 'Persisted OCR')
        finishes = [call for call in self.worker.rpc.call_args_list if call.args[0] == 'finish_submission_job']
        self.assertEqual(len(finishes), 1)
        self.assertEqual(finishes[0].args[1]['result_text'], 'Persisted OCR')
        self.assertIsNone(finishes[0].args[1]['failure'])

    @patch('submission_worker.supabase_request', return_value=[{'id': 's'}])
    def test_check_failure_is_not_completed_with_zero_similarity(self, db):
        self.checker.side_effect = ValueError('Provider unavailable')
        self.worker.process(self.job)
        payload = self.worker.rpc.call_args.args[1]
        self.assertEqual(payload['failure'], 'Provider unavailable')
        self.assertIsNone(payload['result_scan'])

    @patch('submission_worker.supabase_request', return_value=[{'id': 's'}])
    def test_lost_lease_cannot_run_or_publish_a_check(self, db):
        self.worker.rpc.return_value = False
        self.worker.process(self.job)
        self.checker.assert_not_called()
        self.assertEqual(self.worker.rpc.call_count, 1)


if __name__ == '__main__':
    unittest.main()
