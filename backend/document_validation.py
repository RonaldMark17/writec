"""File-mode validation, separate from handwritten image and pasted text intake."""
import io
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

ERROR = 'Unsupported file type. Please upload a PDF, DOC, or DOCX file only.'
DOC_LIMITATION = 'Legacy DOC processing is not supported. Save the document as PDF or DOCX and choose it again.'
TYPES = {'.pdf': 'application/pdf', '.doc': 'application/msword',
         '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}


def validate_document(data, filename, content_type=None):
    ext = Path(filename).suffix.lower()
    mime = (content_type or '').split(';')[0].lower()
    if ext not in TYPES or (mime and mime not in (TYPES[ext], 'application/octet-stream')):
        raise ValueError(ERROR)
    if not data or len(data) > 25 * 1024**2:
        raise ValueError('Choose a nonempty document up to 25 MB.')
    try:
        if ext == '.pdf':
            if not data.startswith(b'%PDF-'):
                raise ValueError(ERROR)
            from pypdf import PdfReader
            PdfReader(io.BytesIO(data))
        elif ext == '.docx':
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for name in ('[Content_Types].xml', 'word/document.xml'):
                    entry = archive.getinfo(name)
                    if entry.file_size > 25 * 1024**2:
                        raise ValueError(ERROR)
                    root = ET.fromstring(archive.read(entry))
                    if name == 'word/document.xml' and root.tag != '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}document':
                        raise ValueError(ERROR)
        else:
            if not data.startswith(bytes.fromhex('D0CF11E0A1B11AE1')):
                raise ValueError(ERROR)
            raise ValueError(DOC_LIMITATION)
    except ValueError:
        raise
    except Exception:
        raise ValueError(ERROR) from None
