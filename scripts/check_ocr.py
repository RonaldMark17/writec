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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--expected-lines', type=int)
    args = parser.parse_args()
    data = args.image.read_bytes()
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
        print(json.dumps(result, indent=2, ensure_ascii=True))
        print('Real-model checks passed. Compare the text against the image; this is not an accuracy benchmark.')


if __name__ == '__main__':
    main()
