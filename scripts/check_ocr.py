"""Run real YOLO/TrOCR inference locally without changing cloud records.

Usage: python scripts/check_ocr.py test_internet_sample.jpg --expected-lines 3
Stop the backend first on machines that cannot hold two copies of the models.
"""
import argparse
import asyncio
import io
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch


def error_rates(predicted, reference):
    """Case-sensitive CER/WER with whitespace normalized across line wraps."""
    def distance(left, right):
        previous = list(range(len(right) + 1))
        for i, a in enumerate(left, 1):
            current = [i]
            for j, b in enumerate(right, 1):
                current.append(min(current[-1] + 1, previous[j] + 1,
                                   previous[j - 1] + (a != b)))
            previous = current
        return previous[-1]

    predicted, reference = ' '.join(predicted.split()), ' '.join(reference.split())
    if not reference:
        raise ValueError('Reference transcription must contain text')
    return {'CER': distance(predicted, reference) / len(reference),
            'WER': distance(predicted.split(), reference.split()) / len(reference.split())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--expected-lines', type=int)
    parser.add_argument('--reference', type=Path, help='UTF-8 ground-truth transcription for CER/WER')
    parser.add_argument('--output', type=Path, help='Save recognition results and optional metrics as JSON')
    args = parser.parse_args()
    data = args.image.read_bytes()
    reference = args.reference.read_text(encoding='utf-8-sig') if args.reference else None
    if reference is not None and not reference.strip():
        parser.error('Reference transcription must contain text')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
    # Importing the app loads real models. Disable only unrelated cloud sync;
    # do not run the server lifespan or background submission worker.
    with patch('supabase_sync.sync_all_from_local_db'):
        import main as backend
    from fastapi import UploadFile

    async def collect(response):
        return [json.loads(chunk) async for chunk in response.body_iterator]

    with tempfile.TemporaryDirectory(prefix='writecheck-ocr-') as folder:
        backend.UPLOAD_DIR = Path(folder)
        result = backend.upload_image(UploadFile(filename=args.image.name, file=io.BytesIO(data)))
        events = asyncio.run(collect(backend.upload_image_stream(
            UploadFile(filename=args.image.name, file=io.BytesIO(data)))))
        assert events[-1]['type'] == 'done'
        assert events[-1]['lines'] == result['lines'], 'Streaming text differs'
        assert events[-1].get('line_details', []) == result.get('line_details', []), 'Streaming metadata differs'
        assert not result['truncated'], 'OCR was truncated'
        if args.expected_lines is not None:
            assert result['processed_line_count'] == args.expected_lines, 'Unexpected line count'
        if reference is not None:
            result['evaluation'] = error_rates(' '.join(result['lines']), reference)
        if args.output:
            args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
        print(json.dumps(result, indent=2, ensure_ascii=True))
        print('Real-model checks passed. CER/WER require --reference; one image is not a representative benchmark.')


if __name__ == '__main__':
    main()
