import io
import ast
from pathlib import Path
import unittest
from unittest.mock import Mock
import zipfile
from fastapi import File, HTTPException, UploadFile

from document_validation import validate_document, ERROR, DOC_LIMITATION


class DocumentValidationTests(unittest.TestCase):
    def test_real_pdf_and_docx(self):
        from pypdf import PdfWriter
        output = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        writer.write(output)
        validate_document(output.getvalue(), 'essay.pdf', 'application/pdf')
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>')
        validate_document(output.getvalue(), 'essay.docx')

    def test_unsupported_and_renamed_content(self):
        for name in ['essay.txt', 'essay.jpg', 'fake.pdf', 'fake.docx', 'fake.doc', 'essay.exe']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_document(b'plain text', name)
        with self.assertRaisesRegex(ValueError, ERROR):
            validate_document(b'%PDF-', 'essay.pdf', 'image/jpeg')
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('unrelated.txt', 'Not a Word file')
        with self.assertRaises(ValueError):
            validate_document(output.getvalue(), 'renamed.docx')

    def test_doc_limitation_is_explicit(self):
        with self.assertRaisesRegex(ValueError, DOC_LIMITATION):
            validate_document(bytes.fromhex('D0CF11E0A1B11AE1'), 'essay.doc')

    def test_extraction_endpoint_rejects_before_ocr(self):
        tree = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'extract_uploaded_document')
        node.decorator_list = []
        ocr = Mock()
        scope = dict(File=File, HTTPException=HTTPException, UploadFile=UploadFile, submission_image_ocr=ocr)
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'main.py', 'exec'), scope)
        for name in ['essay.txt', 'photo.jpg', 'renamed.pdf', 'renamed.docx']:
            with self.subTest(name=name), self.assertRaises(HTTPException) as failure:
                scope['extract_uploaded_document'](UploadFile(filename=name, file=io.BytesIO(b'plain text')))
            self.assertEqual(failure.exception.status_code, 400)
            self.assertEqual(failure.exception.detail, ERROR)
        ocr.assert_not_called()


if __name__ == '__main__':
    unittest.main()
