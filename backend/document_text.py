"""Extract actual document contents; unsupported or empty files fail explicitly."""
import io
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET


def extract_document(data, filename, image_ocr):
    if not data or len(data) > 25 * 1024 * 1024:
        raise ValueError('The document must be between 1 byte and 25 MB.')
    extension = Path(filename).suffix.lower()
    if extension in {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}:
        text = image_ocr(data, filename)
    elif extension in {'.txt', '.md', '.csv', '.json'}:
        text = data.decode('utf-8-sig')
    elif extension == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entry = archive.getinfo('word/document.xml')
            if entry.file_size > 25 * 1024 * 1024:
                raise ValueError('Document contents are too large.')
            root = ET.fromstring(archive.read(entry))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            text = '\n'.join(''.join(p.itertext()) for p in root.findall('.//w:p', ns))
    elif extension == '.pdf':
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > 100:
            raise ValueError('PDF documents must contain at most 100 pages.')
        parts = []
        for page in reader.pages:
            content = (page.extract_text() or '').strip()
            if not content:
                # Image-only PDF pages need OCR; never interpret PDF binary as text.
                content = '\n'.join(image_ocr(img.data, img.name) for img in page.images)
            if not content.strip():
                raise ValueError('A PDF page could not be read. Supply a readable document or corrected transcription.')
            parts.append(content)
        text = '\n'.join(parts)
    else:
        raise ValueError('Unsupported document. Use TXT, DOCX, PDF, or an image.')
    text = text.strip()
    if not text:
        raise ValueError('No readable text was found. Correct the transcription and retry.')
    return text
