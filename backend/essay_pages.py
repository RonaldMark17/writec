"""Ordered essay pages, bounded image validation, and immutable original bundles.

An .essay.zip is one submission file, so existing ownership, revisions, and
history authorization apply to every page without a second database lifecycle.
"""
import io
import json
import os
import uuid
import warnings
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from types import SimpleNamespace
from PIL import Image, UnidentifiedImageError

from submission_access import require_assignment, require_file, local_file

router = APIRouter()
IMAGE_FORMATS = {'JPEG': ('jpg', 'image/jpeg'), 'PNG': ('png', 'image/png'),
                 'WEBP': ('webp', 'image/webp'), 'BMP': ('bmp', 'image/bmp'), 'TIFF': ('tiff', 'image/tiff')}


def upload_limits():
    def positive(name, default):
        value = float(os.getenv(name, default))
        if value <= 0:
            raise ValueError(f'{name} must be positive.')
        return value
    return {'max_image_bytes': int(positive('MAX_IMAGE_SIZE_MB', 10) * 1024**2),
            'max_submission_bytes': int(positive('MAX_SUBMISSION_SIZE_MB', 50) * 1024**2),
            'max_pages': int(positive('MAX_ESSAY_PAGES', 20))}


@router.get('/api/upload-limits')
def get_upload_limits():
    return upload_limits()


def validate_image(data, max_bytes=None):
    limits = upload_limits()
    limit = max_bytes if max_bytes is not None else min(limits['max_image_bytes'], limits['max_submission_bytes'])
    if not data or len(data) > limit:
        raise ValueError(f"Each image must be nonempty and {limit / 1024**2:g} MB or smaller.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                fmt = image.format
                if fmt not in IMAGE_FORMATS or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('Choose a single-page JPG, PNG, WEBP, BMP, or TIFF image.')
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError('The file is not a readable supported image.') from None
    return IMAGE_FORMATS[fmt]


def ordered_page_text(pages):
    ordered = sorted(pages, key=lambda page: page['page_number'])
    if not ordered or [p['page_number'] for p in ordered] != list(range(1, len(ordered) + 1)):
        raise ValueError('Page numbers must be unique and consecutive, starting at 1.')
    for page in ordered:
        if page.get('status') != 'ready' or not isinstance(page.get('text'), str) or not page['text'].strip():
            raise ValueError(f"Page {page['page_number']} could not be processed. Please retry this page.")
    # Keep recognized wording and internal line/paragraph breaks unchanged.
    # A page turn is not automatically a paragraph break.
    return '\n'.join(page['text'].strip() for page in ordered)


def validated_uploads(files):
    limits = upload_limits()
    if not 1 <= len(files) <= limits['max_pages']:
        raise ValueError(f"Choose between 1 and {limits['max_pages']} pages.")
    total, images = 0, []
    for number, file in enumerate(files, 1):
        data = file.file.read(min(limits['max_image_bytes'], limits['max_submission_bytes'] - total) + 1)
        total += len(data)
        if total > limits['max_submission_bytes']:
            raise ValueError(f"The total submission must not exceed {limits['max_submission_bytes'] / 1024**2:g} MB.")
        try:
            validate_image(data)
        except ValueError as exc:
            raise ValueError(f'Page {number}: {exc}') from None
        images.append(data)
    return images


def transcribe_pages(images, filenames, transcribe):
    """Reuse single-page YOLO/TrOCR streaming; never emit done for partial work."""
    pages = []
    for number, data in enumerate(images, 1):
        yield {'type': 'page', 'page_number': number, 'page_count': len(images), 'phase': 'Detecting text lines'}
        try:
            result = None
            response = transcribe(SimpleNamespace(filename=filenames[number-1], file=io.BytesIO(data)))
            for encoded in response:
                event = json.loads(encoded)
                if event['type'] == 'error':
                    raise ValueError(event.get('detail', 'Transcription failed.'))
                if event['type'] == 'done':
                    result = event
                yield {**event, 'type': 'page_progress', 'page_number': number, 'page_count': len(images), 'phase': 'Transcribing'}
            if not result or result.get('truncated') or not result.get('text', '').strip():
                raise ValueError('The page has no complete transcription. Try a clearer image or check the OCR settings.')
            pages.append({'page_number': number, 'name': filenames[number-1], 'text': result['text'].strip(),
                          'status': 'ready', 'lines': result.get('lines', [])})
        except Exception as exc:
            detail = str(exc) if isinstance(exc, ValueError) else 'Transcription failed.'
            yield {'type': 'error', 'page_number': number, 'detail': f'Page {number} could not be processed. {detail} Please retry transcription.'}
            return
    yield {'type': 'page', 'page_number': len(images), 'page_count': len(images), 'phase': 'Combining essay'}
    yield {'type': 'done', 'text': ordered_page_text(pages), 'pages': pages}


@router.post('/api/upload-pages-stream')
def upload_pages_stream(request: Request, files: list[UploadFile] = File(...)):
    try:
        images = validated_uploads(files)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    def events():
        # main installs the same generator used by the existing single-file API.
        for event in transcribe_pages(images, [file.filename or 'page' for file in files], request.app.state.transcribe_page_events):
            yield json.dumps(event, ensure_ascii=False) + '\n'
    return StreamingResponse(events(), media_type='application/x-ndjson')


def read_bundle(data, only_page=None, enforce_limits=True):
    """Read only known members, with bounded expansion; never extract paths."""
    limits = upload_limits()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            info = bundle.getinfo('manifest.json')
            if info.file_size > 2 * 1024**2:
                raise ValueError('Essay metadata is too large.')
            manifest = json.loads(bundle.read(info))
            pages = manifest['pages']
            if manifest.get('version') != 1 or not isinstance(pages, list) or not pages or (enforce_limits and len(pages) > limits['max_pages']):
                raise ValueError('Invalid essay page bundle.')
            combined = ordered_page_text(pages)
            if manifest.get('text') != combined:
                raise ValueError('Complete essay does not match its ordered pages.')
            total = 0
            contents = []
            for page in sorted(pages, key=lambda p: p['page_number']):
                member = bundle.getinfo(page['file'])
                total += member.file_size
                # Historical originals stay readable if new-upload limits are
                # lowered. Bundles use ZIP_STORED, so the archive's actual byte
                # length still bounds expansion of previously accepted pages.
                image_limit = limits['max_image_bytes'] if enforce_limits else len(data)
                total_limit = limits['max_submission_bytes'] if enforce_limits else len(data)
                if member.file_size > image_limit or total > total_limit:
                    raise ValueError('Essay pages exceed configured upload limits.')
                if only_page is not None and page['page_number'] != only_page:
                    continue
                image = bundle.read(member)
                _, mime = validate_image(image, max_bytes=image_limit)
                contents.append((page, image, mime))
            return manifest, contents
    except (zipfile.BadZipFile, KeyError, TypeError, json.JSONDecodeError):
        raise ValueError('Invalid essay page bundle.') from None


@router.post('/api/submissions/upload-pages')
def upload_pages(request: Request, assignment_id: str = Form(...),
                 pages: str = Form(...), files: list[UploadFile] = File(...)):
    account = require_assignment(request, assignment_id)
    if account['role'] != 'student':
        raise HTTPException(403, 'Only students can upload submissions.')
    try:
        owner, assignment = str(uuid.UUID(account['id'])), str(uuid.UUID(assignment_id))
        metadata = json.loads(pages)
        limits = upload_limits()
        if not isinstance(metadata, list) or len(metadata) != len(files) or not 1 <= len(files) <= limits['max_pages']:
            raise ValueError(f"Choose between 1 and {limits['max_pages']} pages.")
        # The multipart order and explicit page numbers must agree. No filename sorting.
        if [p.get('page_number') for p in metadata] != list(range(1, len(files) + 1)):
            raise ValueError('Uploaded pages must follow their numbered preview order.')
        combined = ordered_page_text(metadata)
        if len(combined) > 250000:
            raise ValueError('The complete essay exceeds the text limit.')
        validated, total = [], 0
        for number, file in enumerate(files, 1):
            data = file.file.read(min(limits['max_image_bytes'], limits['max_submission_bytes'] - total) + 1)
            total += len(data)
            if total > limits['max_submission_bytes']:
                raise ValueError(f"The total submission must not exceed {limits['max_submission_bytes'] / 1024**2:g} MB.")
            try:
                extension, _ = validate_image(data)
            except ValueError as exc:
                raise ValueError(f'Page {number}: {exc}') from None
            validated.append((f'pages/{number}.{extension}', data))
        manifest = {'version': 1, 'student_id': owner, 'assignment_id': assignment,
                    'text': combined, 'pages': [
                        {'page_number': i + 1, 'file': item[0], 'name': Path(files[i].filename or 'page').name,
                         'text': metadata[i]['text'].strip(), 'status': 'ready'}
                        for i, item in enumerate(validated)]}
        folder = local_file(request.app.state.upload_root, f'submissions/{owner}/{assignment}')
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f'{uuid.uuid4().hex}.essay.zip'
        # Only publish a reference after every image and transcript has validated.
        try:
            with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as bundle:
                bundle.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False))
                for name, data in validated:
                    bundle.writestr(name, data)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return {'file_url': f"{str(request.base_url).rstrip('/')}/uploads/submissions/{owner}/{assignment}/{target.name}",
                'page_count': len(files), 'text': combined}
    except (ValueError, TypeError, AttributeError, KeyError) as exc:
        raise HTTPException(400, str(exc)) from None


@router.get('/api/submissions/pages')
def view_pages(request: Request, file_url: str = Query(...), page_number: int | None = Query(None, ge=1)):
    kind, key = require_file(request, file_url)
    if not key.endswith('.essay.zip'):
        raise HTTPException(400, 'Not a multi-page essay.')
    if kind != 'local':
        raise HTTPException(400, 'Essay bundles must use server-managed storage.')
    target = local_file(request.app.state.upload_root, key)
    if not target.is_file():
        raise HTTPException(404, 'Essay file is missing.')
    try:
        manifest, contents = read_bundle(target.read_bytes(), only_page=page_number or 0, enforce_limits=False)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    if page_number is None:
        return manifest
    if not contents:
        raise HTTPException(404, 'Page not found.')
    _, data, mime = contents[0]
    return Response(data, media_type=mime, headers={'Cache-Control': 'private, no-store'})
