# Checking OCR quality

The backend uses `backend/models/yolo/best.pt` and the TrOCR checkpoint selected
by `TROCR_MODEL_PATH` in `backend/.env`. Model weights are unchanged by these fixes.

Run the real backend recognition and streaming consistency check:

```powershell
python scripts/check_ocr.py test_internet_sample.jpg --expected-lines 3
```

To measure recognition accuracy, provide a manually verified UTF-8 transcription:

```powershell
python scripts/check_ocr.py your-page.jpg --reference your-page.txt --output results.json
```

The script reports character error rate (CER) and word error rate (WER); lower
is better. Metrics preserve case and punctuation but normalize whitespace so
line wrapping does not affect the score. Use the same held-out pages and
references before and after tuning. Include different writers, lighting,
page tilts, short lines, and long lines. A passing line-count check or high
model confidence is not evidence of transcription accuracy.

The script disables startup cloud synchronization and uses temporary uploads.
Stop the backend first if memory cannot accommodate a second model instance.
CPU inference is supported but slower than GPU inference.

## Pipeline corrections

- Duplicate suppression checks both horizontal and vertical overlap, keeping
  separate regions that share a row and checking nonadjacent duplicates.
- Both entry points use the same deskew direction and expand the canvas to
  preserve page-edge writing.
- Original/enhanced candidate selection protects against omitted text in
  either direction. This remains a heuristic; longer text can also be wrong.

Regression checks:

```powershell
python -m unittest discover -s backend -p test_ocr_regions.py -v
```

The stored YOLO experiment summary reports test mAP50 of 0.991934 and
mAP50-95 of 0.626600. These are historical detection metrics, not a new
evaluation of these local weights or TrOCR recognition accuracy. A labeled
representative evaluation set is required to claim an overall accuracy gain.
