import base64
import io
import json
import os
import re
import shutil
import sys
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"


def _load_env_file():
    """Load key-value pairs from .env if not already loaded into os.environ."""
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val


_load_env_file()

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
import torch
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from ultralytics import YOLO

import plagiarism_db
from ocr_regions import prepare_line_boxes, choose_transcript, deskew_and_clean_image
from submission_access import (
    visible_submissions, require_submission, require_assignment, require_scan,
    require_file, local_file, storage_download,
)
from admin_api import authenticated_account, supabase_request
from submission_persistence import read_results, save_results
from copyleaks_service import copyleaks_service

from essay_formatter import (
    clean_punctuation_and_casing,
    correct_domain_terms,
    format_essay_document,
)

UPLOAD_DIR = BASE_DIR / "uploads"
MODEL_DIR = BASE_DIR / "models"

DEFAULT_YOLO_MODEL_PATH = MODEL_DIR / "yolo" / "best.pt"
LEGACY_YOLO_MODEL_PATH = BASE_DIR / "best.pt"
DEFAULT_TROCR_MODEL_PATH = MODEL_DIR / "final_model"

# Configuration matching high-accuracy New folder (19) reference
YOLO_CONF = float(os.getenv("YOLO_CONF", "0.25"))
YOLO_IOU = float(os.getenv("YOLO_IOU", "0.40"))
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "1024"))
PAD_RATIO_VERT = float(os.getenv("PAD_RATIO_VERT", "0.20"))
PAD_PX_HORIZ = int(os.getenv("PAD_PX_HORIZ", "6"))
MAX_OCR_LINES = int(os.getenv("MAX_OCR_LINES", "0"))
OCR_BATCH_SIZE = max(1, int(os.getenv("OCR_BATCH_SIZE", "8")))
OCR_NUM_BEAMS = int(os.getenv("OCR_NUM_BEAMS", "4"))
OCR_MAX_NEW_TOKENS = int(os.getenv("OCR_MAX_NEW_TOKENS", "64"))
OCR_REPETITION_PENALTY = float(os.getenv("OCR_REPETITION_PENALTY", "1.2"))
OCR_NO_REPEAT_NGRAM_SIZE = int(os.getenv("OCR_NO_REPEAT_NGRAM_SIZE", "3"))
TORCH_THREADS = max(1, int(os.getenv("TORCH_THREADS", str(os.cpu_count() or 1))))
TROCR_CPU_QUANTIZE = os.getenv("TROCR_CPU_QUANTIZE", "0") != "0"
TROCR_USE_CACHE = os.getenv("TROCR_USE_CACHE", "1") != "0"

torch.set_num_threads(TORCH_THREADS)


def resolve_yolo_model_path():
    _load_env_file()
    configured_path = os.getenv("YOLO_MODEL_PATH")
    candidates = []

    if configured_path:
        candidates.append(Path(configured_path).expanduser())

    candidates.extend([
        DEFAULT_YOLO_MODEL_PATH,
        MODEL_DIR / "best.pt",
        LEGACY_YOLO_MODEL_PATH,
        Path("C:/Users/ronal/OneDrive/Desktop/New folder (19)/best.pt"),
        Path.home() / "OneDrive" / "Desktop" / "New folder (19)" / "best.pt",
        BASE_DIR.parent / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "training_results" / "weights" / "best.pt",
        BASE_DIR.parent / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "weights" / "best.pt",
        BASE_DIR.parent / "weights" / "best.pt",
        BASE_DIR.parent / "best.pt",
    ])

    for candidate in candidates:
        if candidate.exists():
            return candidate

    searched = "\n".join(f"- {candidate}" for candidate in candidates)
    raise RuntimeError(
        "YOLO weights were not found. Put best.pt at "
        f"{DEFAULT_YOLO_MODEL_PATH} or set YOLO_MODEL_PATH.\nSearched:\n{searched}"
    )


def resolve_trocr_model_source():
    _load_env_file()
    configured_path = os.getenv("TROCR_MODEL_PATH")

    if configured_path and Path(configured_path).exists():
        return configured_path

    configured_model = os.getenv("TROCR_MODEL_NAME")

    if configured_model:
        return configured_model

    candidates = [
        DEFAULT_TROCR_MODEL_PATH,
        MODEL_DIR / "my_trocr_model",
        Path("C:/Users/ronal/OneDrive/Desktop/New folder (19)/final_model"),
        Path.home() / "OneDrive" / "Desktop" / "New folder (19)" / "final_model",
        BASE_DIR.parent / "final_model",
        Path.home() / "OneDrive" / "Desktop" / "New folder (21)" / "WriteCheck" / "final_model",
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    searched = "\n".join(f"- {candidate}" for candidate in candidates)
    raise RuntimeError(
        "TrOCR model folder was not found. Put model at "
        f"{DEFAULT_TROCR_MODEL_PATH} or set TROCR_MODEL_PATH.\nSearched:\n{searched}"
    )


def preprocess_crop_clahe(crop_pil):
    """Enhance stroke contrast against ruled/yellow backgrounds via CLAHE (from New folder 19)."""
    img_np = np.array(crop_pil)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return Image.fromarray(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB))


def trim_line_crop_whitespace(crop_pil: Image.Image, pad_px: int = 24):
    """
    Trims excessive leading and trailing horizontal whitespace from line crops
    while filtering out ruled notebook/pad lines using morphological subtraction.
    Returns (trimmed_pil, offset_x1, offset_x2, has_valid_ink).
    """
    w, h = crop_pil.size
    if w < 60 or h < 10:
        return crop_pil, 0, w, True

    try:
        img_np = np.array(crop_pil)
        if len(img_np.shape) == 2:
            gray = img_np
        else:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 15
        )

        # Detect and remove pure horizontal ruled lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        detected_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
        ink_only = cv2.subtract(thresh, detected_lines)

        # Remove tiny salt-and-pepper noise
        clean_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        ink_only = cv2.morphologyEx(ink_only, cv2.MORPH_OPEN, clean_kernel)

        total_ink = int(np.count_nonzero(ink_only))
        # If crop has negligible handwriting ink (faint margin or line shadow), reject phantom crop
        if total_ink < 80:
            return crop_pil, 0, w, False

        col_sums = np.sum(ink_only, axis=0)
        # Column has significant handwriting ink if at least 3 dark pixels exist
        ink_cols = np.where(col_sums > 255 * 3)[0]

        if len(ink_cols) >= 8:
            min_x = max(0, int(ink_cols[0]) - pad_px)
            max_x = min(w, int(ink_cols[-1]) + pad_px)
            # Only trim if we save at least 15% width and have reasonable remaining width
            if (max_x - min_x) >= 50 and (w - (max_x - min_x)) > 0.15 * w:
                return crop_pil.crop((min_x, 0, max_x, h)), min_x, max_x, True
    except Exception as exc:
        print(f"[ocr] trim notice: {exc}", flush=True)

    return crop_pil, 0, w, True


def extract_adaptive_line_crops(raw_img, boxes):
    """
    Adaptive line extraction:
    1. Sorts boxes strictly by vertical centroid to guarantee natural reading order.
    2. Overlap filter keeps distinct lines and suppresses duplicate detections.
    3. Trims excessive horizontal blank margins around handwriting.
    4. Uses neighbor-bounded adaptive padding (safe_pad_t / safe_pad_b).
    5. Applies CLAHE contrast enhancement on every crop.
    """
    img_w, img_h = raw_img.size
    parsed_boxes = []

    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf = float(box.conf[0])
        parsed_boxes.append({
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "centroid_y": (y1 + y2) / 2.0,
            "height": y2 - y1,
            "conf": conf,
        })

    # Sort strictly by vertical centroid
    parsed_boxes.sort(key=lambda b: b["centroid_y"])

    # TrOCR expects one writing line per crop. Adjacent lines on ruled paper
    # can share connected strokes; merging them silently loses entire sentences.
    # Keep this experimental repair opt-in rather than merging normal YOLO lines.
    filtered_boxes = prepare_line_boxes(
        raw_img, parsed_boxes, repair_split_lines=os.getenv("OCR_JOIN_SPLIT_LINES", "0") == "1"
    )
    crops = []
    num_boxes = len(filtered_boxes)

    for idx, b in enumerate(filtered_boxes):
        max_pad = int(b["height"] * PAD_RATIO_VERT)
        if idx > 0:
            dist_prev = b["y1"] - filtered_boxes[idx - 1]["y2"]
            safe_pad_t = min(max_pad, max(0, dist_prev // 2))
        else:
            safe_pad_t = max_pad

        if idx < num_boxes - 1:
            dist_next = filtered_boxes[idx + 1]["y1"] - b["y2"]
            safe_pad_b = min(max_pad, max(0, dist_next // 2))
        else:
            safe_pad_b = max_pad

        cx1 = max(0, b["x1"] - PAD_PX_HORIZ)
        cy1 = max(0, b["y1"] - safe_pad_t)
        cx2 = min(img_w, b["x2"] + PAD_PX_HORIZ)
        cy2 = min(img_h, b["y2"] + safe_pad_b)

        raw_crop = raw_img.crop((cx1, cy1, cx2, cy2))

        # Horizontal ink trimming to remove empty paper margins on pad paper
        trimmed_crop, trim_off_x1, trim_off_x2, has_valid_ink = trim_line_crop_whitespace(raw_crop)
        if not has_valid_ink:
            continue

        actual_cx1 = cx1 + trim_off_x1
        actual_cx2 = cx1 + trim_off_x2

        enhanced_crop = preprocess_crop_clahe(trimmed_crop)

        crops.append({
            "box": {"x1": actual_cx1, "y1": cy1, "x2": actual_cx2, "y2": cy2},
            "crop": enhanced_crop,
            "original_crop": trimmed_crop,
            "conf": b["conf"],
        })

    return crops, parsed_boxes, filtered_boxes


def configure_trocr_kv_cache(model, enabled):
    if hasattr(model.config, "use_cache"):
        model.config.use_cache = enabled

    if hasattr(model.config, "decoder") and model.config.decoder is not None:
        model.config.decoder.use_cache = enabled

    if hasattr(model, "decoder") and hasattr(model.decoder, "config"):
        model.decoder.config.use_cache = enabled

    if hasattr(model, "generation_config"):
        model.generation_config.use_cache = enabled


def encode_stream_event(payload):
    return f"{json.dumps(payload)}\n"


def recognize_line_batches(line_crops, started_at, num_beams=None):
    effective_beams = num_beams if num_beams is not None else OCR_NUM_BEAMS

    # Compare original pixels with contrast enhancement instead of assuming
    # enhancement always helps. Keep the image batch within the configured size.
    line_batch_size = max(1, OCR_BATCH_SIZE // 2)
    for index in range(0, len(line_crops), line_batch_size):
        batch_items = line_crops[index : index + line_batch_size]
        batch_images = [crop for item in batch_items
                        for crop in (item.get("original_crop", item["crop"]), item["crop"])]

        # Dynamic max token bounding by aspect ratio (avoids wasted decoding steps on short lines)
        max_aspect = max(
            (item["crop"].width / max(1, item["crop"].height))
            for item in batch_items
        )
        dynamic_max_tokens = min(OCR_MAX_NEW_TOKENS, max(24, int(max_aspect * 5.0)))

        pixel_values = processor(
            images=batch_images,
            return_tensors="pt",
            padding=True,
        ).pixel_values.to(device)

        if TROCR_FP16:
            pixel_values = pixel_values.half()

        with torch.inference_mode():
            gen_kwargs = {
                "max_new_tokens": dynamic_max_tokens,
                "repetition_penalty": OCR_REPETITION_PENALTY,
                "use_cache": TROCR_USE_CACHE,
                "early_stopping": True,
            }
            if effective_beams > 1:
                gen_kwargs["num_beams"] = effective_beams
                gen_kwargs["no_repeat_ngram_size"] = OCR_NO_REPEAT_NGRAM_SIZE

            generated = trocr_model.generate(pixel_values, **gen_kwargs,
                return_dict_in_generate=True, output_scores=True)
            generated_ids = generated.sequences
            token_scores = trocr_model.compute_transition_scores(
                generated_ids, generated.scores,
                getattr(generated, "beam_indices", None), normalize_logits=True)

        candidate_texts = [
            text.strip()
            for text in processor.batch_decode(
                generated_ids,
                skip_special_tokens=True,
            )
        ]

        # Model likelihood is a review signal, not calibrated accuracy.
        candidate_confs = []
        for scores in token_scores:
            valid = scores[scores < 0]
            candidate_confs.append(round(float(valid.mean().exp()), 3) if valid.numel() else 0.0)
        batch_texts, batch_confs, batch_agreements = [], [], []
        for offset in range(0, len(candidate_texts), 2):
            best = offset + choose_transcript(*candidate_texts[offset:offset + 2],
                                               *candidate_confs[offset:offset + 2])
            batch_texts.append(candidate_texts[best])
            batch_confs.append(candidate_confs[best])
            batch_agreements.append(candidate_texts[offset].casefold() == candidate_texts[offset + 1].casefold())

        print(
            f"[ocr] trocr batch {index // line_batch_size + 1} "
            f"lines={index + 1}-{index + len(batch_items)}/{len(line_crops)} "
            f"tokens_cap={dynamic_max_tokens} "
            f"done in {time.perf_counter() - started_at:.2f}s",
            flush=True,
        )

        yield {
            "start_index": index,
            "lines": batch_texts,
            "confidences": batch_confs,
            "needs_review": [not agrees or score < 0.75
                             for score, agrees in zip(batch_confs, batch_agreements)],
            "boxes": [item["box"] for item in batch_items],
        }


def recognize_lines(line_crops, started_at, num_beams=None):
    """Recognizes lines and preserves exact reading order."""
    generated_texts = []
    generated_confs = []
    needs_review = []
    for batch in recognize_line_batches(line_crops, started_at, num_beams=num_beams):
        generated_texts.extend(batch["lines"])
        generated_confs.extend(batch.get("confidences", []))
        needs_review.extend(batch["needs_review"])
    return generated_texts, generated_confs, needs_review


def prepare_ocr_input(file, started_at):
    safe_filename = Path(file.filename or "upload.png").name
    request_dir = UPLOAD_DIR / "ocr" / uuid.uuid4().hex
    request_dir.mkdir(parents=True, exist_ok=True)
    filepath = request_dir / safe_filename

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        raw_image = ImageOps.exif_transpose(Image.open(filepath)).convert("RGB")
    except (OSError, UnidentifiedImageError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a readable image.",
        ) from exc

    # Apply auto-deskewing for tilted phone photos
    image = deskew_and_clean_image(raw_image)

    normalized_filepath = filepath.with_name(f"{filepath.stem}_normalized.png")
    image.save(normalized_filepath)

    print(f"[ocr] received={safe_filename} size={image.size}", flush=True)

    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    results = list(yolo_model.predict(
        source=img_cv,
        conf=YOLO_CONF,
        iou=YOLO_IOU,
        imgsz=YOLO_IMGSZ,
        verbose=False,
        half=(device == "cuda"),
    ))

    raw_yolo_boxes = getattr(results[0], "boxes", [])
    raw_boxes_dicts = []
    for box in raw_yolo_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        raw_boxes_dicts.append({
            "x1": float(x1),
            "y1": float(y1),
            "x2": float(x2),
            "y2": float(y2),
            "confidence": float(box.conf[0]),
        })

    # Step 5 & 6: Adaptive line extraction matching New folder (19)
    line_crops, parsed_boxes, filtered_boxes = extract_adaptive_line_crops(image, raw_yolo_boxes)

    detected_line_count = len(line_crops)
    duplicate_line_count = len(parsed_boxes) - len(filtered_boxes)
    truncated = MAX_OCR_LINES > 0 and detected_line_count > MAX_OCR_LINES

    if truncated:
        line_crops = line_crops[:MAX_OCR_LINES]

    print(
        f"[ocr] yolo detected={len(parsed_boxes)} "
        f"filtered={detected_line_count} "
        f"done in {time.perf_counter() - started_at:.2f}s",
        flush=True,
    )

    return {
        "raw_boxes": raw_boxes_dicts,
        "line_crops": line_crops,
        "detected_line_count": detected_line_count,
        "duplicate_line_count": duplicate_line_count,
        "truncated": truncated,
    }


# ==========================================
# FASTAPI
# ==========================================

from admin_api import router as admin_router, install_account_guard
from submission_intake import router as submission_intake_router
from submission_status import router as submission_status_router

app = FastAPI()
from service_status import router as service_status_router
from notifications import NotificationWorker
app.include_router(service_status_router)
app.include_router(admin_router)
app.include_router(submission_intake_router)
app.include_router(submission_status_router)
app.state.upload_root = UPLOAD_DIR
install_account_guard(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# LOAD MODELS
# ==========================================

YOLO_MODEL_PATH = resolve_yolo_model_path()
TROCR_MODEL_SOURCE = resolve_trocr_model_source()

print(f"[ocr] loading YOLO from {YOLO_MODEL_PATH}", flush=True)
yolo_model = YOLO(str(YOLO_MODEL_PATH))

print(f"[ocr] loading TrOCR from {TROCR_MODEL_SOURCE}", flush=True)
is_local_trocr = Path(TROCR_MODEL_SOURCE).exists()
processor = TrOCRProcessor.from_pretrained(TROCR_MODEL_SOURCE, local_files_only=is_local_trocr)
trocr_model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL_SOURCE, local_files_only=is_local_trocr)

device = "cuda" if torch.cuda.is_available() else "cpu"
TROCR_FP16 = (device == "cuda") and (os.getenv("TROCR_FP16", "1") != "0")

if device == "cuda":
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    if TROCR_FP16:
        print("[ocr] converting TrOCR to FP16 for Ampere Tensor Core acceleration", flush=True)
        trocr_model = trocr_model.half()

trocr_model.to(device)
trocr_model.eval()

# Suppress max_length warning when max_new_tokens is passed
if hasattr(trocr_model.config, "max_length"):
    trocr_model.config.max_length = None
if hasattr(trocr_model, "generation_config") and hasattr(trocr_model.generation_config, "max_length"):
    trocr_model.generation_config.max_length = None

if device == "cpu" and TROCR_CPU_QUANTIZE:
    print("[ocr] applying CPU dynamic quantization to TrOCR", flush=True)
    trocr_model = torch.ao.quantization.quantize_dynamic(
        trocr_model,
        {torch.nn.Linear},
        dtype=torch.qint8,
    )

configure_trocr_kv_cache(trocr_model, TROCR_USE_CACHE)

print(
    f"[ocr] TrOCR device={device} "
    f"fp16={TROCR_FP16} "
    f"beams={OCR_NUM_BEAMS} "
    f"batch_size={OCR_BATCH_SIZE} "
    f"use_cache={TROCR_USE_CACHE}",
    flush=True,
)


def warmup_models():
    """Pre-warm GPU kernels on startup to eliminate cold-start lag."""
    try:
        dummy_img = Image.new("RGB", (384, 64), color=(255, 255, 255))
        pv = processor(images=[dummy_img], return_tensors="pt").pixel_values.to(device)
        if TROCR_FP16:
            pv = pv.half()
        with torch.inference_mode():
            trocr_model.generate(pv, max_new_tokens=4, use_cache=True)
        print("[ocr] models warmed up successfully", flush=True)
    except Exception as e:
        print(f"[ocr] warmup note: {e}", flush=True)


warmup_models()
app.state.ocr_ready = True

# Background synchronization to Supabase for all local plagiarism.db records
try:
    from supabase_sync import sync_all_from_local_db
    import threading
    threading.Thread(target=sync_all_from_local_db, daemon=True).start()
except Exception as _e:
    print(f"[supabase sync] startup sync notice: {_e}", flush=True)

os.makedirs(UPLOAD_DIR / "submissions", exist_ok=True)

# Serve only exact file references attached to an authorized submission.
@app.api_route("/uploads/{file_path:path}", methods=["GET", "HEAD"])
def serve_upload(file_path: str, request: Request):
    _, key = require_file(request, "/uploads/" + file_path, kind="local")
    target = local_file(UPLOAD_DIR, key)
    if not target.is_file():
        raise HTTPException(404, "File not found.")
    return FileResponse(str(target), headers={"Cache-Control": "private, no-store"})


@app.get("/api/storage/file")
def proxy_storage_file(request: Request, path: str = Query(...)):
    import mimetypes
    from fastapi.responses import Response
    _, key = require_file(request, path, kind="storage")
    data = storage_download(request, key)
    return Response(data, media_type=mimetypes.guess_type(key)[0] or "application/octet-stream",
        headers={"Cache-Control": "private, no-store"})

# ==========================================
# API ROUTES
# ==========================================


@app.get("/api/health")
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "submission_worker_configured": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
        "yolo_model": str(YOLO_MODEL_PATH),
        "trocr_model": str(TROCR_MODEL_SOURCE),
        "device": device,
        "fp16": TROCR_FP16,
        "yolo_imgsz": YOLO_IMGSZ,
        "max_ocr_lines": MAX_OCR_LINES,
        "ocr_batch_size": OCR_BATCH_SIZE,
        "ocr_num_beams": OCR_NUM_BEAMS,
        "trocr_use_cache": TROCR_USE_CACHE,
    }


@app.post("/api/submissions/upload")
def upload_submission_file(request: Request, file: UploadFile = File(...), assignment_id: str = Form(...)):
    """Uploads student essay files locally when Supabase bucket is missing or fails."""
    account = require_assignment(request, assignment_id)
    if account['role'] != 'student':
        raise HTTPException(403, "Only students can upload submissions.")
    # Normalize identifiers before using them as filesystem path segments.
    try:
        owner_id = str(uuid.UUID(account['id']))
        assignment_id = str(uuid.UUID(assignment_id))
    except ValueError:
        raise HTTPException(400, "Invalid assignment identifier.")
    sub_dir = UPLOAD_DIR / "submissions" / owner_id / assignment_id
    sub_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}-{re.sub(r'[^a-zA-Z0-9_.-]', '_', Path(file.filename or 'submission.jpg').name)}"
    target_path = sub_dir / safe_name
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    file_url = f"{str(request.base_url).rstrip('/')}/uploads/submissions/{owner_id}/{assignment_id}/{safe_name}"
    return {
        "success": True,
        "file_url": file_url,
        "filename": safe_name,
        "size": target_path.stat().st_size,
    }


@app.post("/api/users/{target_user_id}/avatar")
async def save_user_avatar(target_user_id: str, request: Request):
    """
    Saves a user's avatar image to Supabase Storage ('avatars' bucket) and local filesystem backup.
    Accepts JSON with base64 data URI or raw multipart file.
    Ensures avatars are publicly accessible to students, teachers, and rosters.
    """
    account = authenticated_account(request)
    if account.get("role") != "admin" and str(account.get("id")).lower() != str(target_user_id).lower():
        raise HTTPException(403, "You can only update your own avatar.")

    avatar_bytes = None
    content_type = "image/jpeg"

    # Support JSON base64 body
    content_type_header = request.headers.get("content-type", "")
    if "application/json" in content_type_header:
        body = await request.json()
        raw_data = body.get("avatar_data", "")
        if raw_data and "," in raw_data:
            header, b64_data = raw_data.split(",", 1)
            if "image/png" in header:
                content_type = "image/png"
            elif "image/webp" in header:
                content_type = "image/webp"
            try:
                avatar_bytes = base64.b64decode(b64_data)
            except Exception:
                raise HTTPException(400, "Invalid base64 image data.")
        elif raw_data:
            try:
                avatar_bytes = base64.b64decode(raw_data)
            except Exception:
                raise HTTPException(400, "Invalid base64 image data.")
    else:
        # Multipart form upload
        form = await request.form()
        file = form.get("file")
        if file and hasattr(file, "read"):
            avatar_bytes = await file.read()
            if hasattr(file, "content_type") and file.content_type:
                content_type = file.content_type

    if not avatar_bytes or len(avatar_bytes) < 10:
        raise HTTPException(400, "No image provided.")

    # 1. Save locally in uploads/avatars/{target_user_id}.jpg
    avatar_dir = UPLOAD_DIR / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    local_path = avatar_dir / f"{target_user_id}.jpg"
    with open(local_path, "wb") as f:
        f.write(avatar_bytes)

    # 2. Upload to Supabase Storage 'avatars' bucket via service role key
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    public_url = f"{url}/storage/v1/object/public/avatars/{target_user_id}.jpg"

    if service_key:
        try:
            req_upload = urllib.request.Request(
                f"{url}/storage/v1/object/avatars/{target_user_id}.jpg",
                data=avatar_bytes,
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
                method="POST",
            )
            with urllib.request.urlopen(req_upload, timeout=10) as resp:
                pass
        except Exception as exc:
            print(f"[avatar] notice: supabase storage upload: {exc}", flush=True)

    return {
        "success": True,
        "avatar_url": public_url,
        "local_avatar_url": f"{str(request.base_url).rstrip('/')}/api/users/{target_user_id}/avatar",
        "user_id": target_user_id,
    }


@app.get("/api/users/{target_user_id}/avatar")
def get_user_avatar(target_user_id: str, request: Request):
    """Publicly serves a user's avatar image without authentication requirements."""
    local_path = UPLOAD_DIR / "avatars" / f"{target_user_id}.jpg"
    if local_path.is_file():
        return FileResponse(
            str(local_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    # Fallback redirect to Supabase Storage public avatar if available
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    public_url = f"{url}/storage/v1/object/public/avatars/{target_user_id}.jpg"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=public_url, status_code=307)


@app.get("/api/submissions/grades")
def get_submission_grades(request: Request):
    """Read authoritative results through the caller's database permissions."""
    return read_results(request)


@app.post("/api/submissions/{submission_id}/return")
def return_submission_endpoint(submission_id: str, request: Request):
    require_submission(request, submission_id, teacher_only=True)
    result = supabase_request('/rest/v1/rpc/return_submission', request.state.access_token,
                              {'submission_key': submission_id})
    return {"success": True, "submission": result}


class ArchiveClassroomRequest(BaseModel):
    is_archived: bool = True


@app.get("/api/classrooms/archived")
def get_archived_classrooms_endpoint(request: Request):
    """
    Returns list of archived classroom IDs.
    Queries using service role key to ensure consistent persistence for both teachers and students.
    """
    authenticated_account(request)
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    if not service_key:
        raise HTTPException(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.")

    req = urllib.request.Request(
        f"{url}/rest/v1/classroomTable?is_archived=eq.true&select=id",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.load(resp)
            return {"success": True, "archived_ids": [str(r["id"]) for r in rows if "id" in r]}
    except Exception as exc:
        return {"success": False, "archived_ids": [], "error": str(exc)}


@app.post("/api/classrooms/{classroom_id}/archive")
def archive_classroom_endpoint(
    classroom_id: str,
    payload: ArchiveClassroomRequest,
    request: Request,
):
    """
    Archives or restores a classroom on behalf of the authenticated teacher.
    Uses the service role key to reliably persist the is_archived column in Supabase.
    """
    account = authenticated_account(request)
    if account.get("role") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can archive classrooms.")

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    if not service_key:
        raise HTTPException(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.")

    req_check = urllib.request.Request(
        f"{url}/rest/v1/classroomTable?id=eq.{classroom_id}&select=id,teacher_id,classroom_name",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req_check, timeout=10) as resp:
            classrooms = json.load(resp)
            if not classrooms:
                raise HTTPException(404, "Classroom not found.")
            classroom = classrooms[0]
            if account.get("role") != "admin" and str(classroom.get("teacher_id")).lower() != str(account.get("id")).lower():
                raise HTTPException(403, "You do not have permission to manage this classroom.")
    except HTTPException:
        raise
    except urllib.error.HTTPError as exc:
        err_msg = "Failed to query classroom."
        try:
            body = json.loads(exc.read().decode("utf-8"))
            if isinstance(body, dict) and "message" in body:
                err_msg = body["message"]
        except Exception:
            pass
        raise HTTPException(exc.code, err_msg)
    except Exception as exc:
        raise HTTPException(500, f"Failed to query classroom: {str(exc)}")

    req_patch = urllib.request.Request(
        f"{url}/rest/v1/classroomTable?id=eq.{classroom_id}",
        data=json.dumps({"is_archived": payload.is_archived}).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req_patch, timeout=10) as resp:
            updated = json.load(resp)
            if not updated or not isinstance(updated, list) or len(updated) == 0:
                raise HTTPException(500, "Database update did not modify any rows.")
            return {
                "success": True,
                "classroom_id": classroom_id,
                "is_archived": payload.is_archived,
                "classroom_name": classroom.get("classroom_name"),
                "updated": updated,
            }
    except HTTPException:
        raise
    except urllib.error.HTTPError as exc:
        err_msg = "Failed to update classroom archive state."
        try:
            body = json.loads(exc.read().decode("utf-8"))
            if isinstance(body, dict) and "message" in body:
                err_msg = body["message"]
        except Exception:
            pass
        raise HTTPException(exc.code, err_msg)
    except Exception as exc:
        raise HTTPException(500, f"Failed to update classroom archive state: {str(exc)}")


@app.post("/api/classrooms/{classroom_id}/leave")
def leave_classroom_endpoint(classroom_id: str, request: Request):
    """
    Allows a student to leave (unenroll from) a classroom.
    Deletes the membership record from classroomMembers using the service role key.
    """
    account = authenticated_account(request)
    student_id = str(account.get("id"))
    if not student_id:
        raise HTTPException(401, "Sign in to continue.")

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    if not service_key:
        raise HTTPException(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.")

    req_delete = urllib.request.Request(
        f"{url}/rest/v1/classroomMembers?classroom_id=eq.{classroom_id}&student_id=eq.{student_id}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "return=representation",
        },
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(req_delete, timeout=10) as resp:
            deleted = json.load(resp)
            return {
                "success": True,
                "classroom_id": classroom_id,
                "student_id": student_id,
                "deleted": deleted,
            }
    except urllib.error.HTTPError as exc:
        err_msg = "Failed to leave classroom."
        try:
            body = json.loads(exc.read().decode("utf-8"))
            if isinstance(body, dict) and "message" in body:
                err_msg = body["message"]
        except Exception:
            pass
        raise HTTPException(exc.code, err_msg)
    except Exception as exc:
        raise HTTPException(500, f"Failed to leave classroom: {str(exc)}")


@app.post("/api/submissions/{submission_id}/grade")
async def save_submission_grade_endpoint(submission_id: str, request: Request):
    """Saves or updates the grade and feedback for a student submission."""
    authorized_submission = require_submission(request, submission_id, teacher_only=True)
    body = await request.json()
    grade = body.get("grade", "")
    feedback = body.get("feedback", "")
    status = body.get("status", "graded")
    transcribed_text = body.get("transcribed_text")
    scan_result = body.get("scan_result")
    assignment_id = str(authorized_submission['assignment_id'])
    if body.get('assignment_id') and str(body['assignment_id']) != assignment_id:
        raise HTTPException(400, "Assignment does not match this submission.")
    saved = save_results(request, submission_id, {
        "grade": grade, "feedback": feedback, "status": status,
        "transcribed_text": transcribed_text, "scan_result": scan_result,
    })
    return {"success": True, "grade_record": saved}


@app.post("/api/submissions/{submission_id}/scan")
async def save_submission_scan_endpoint(submission_id: str, request: Request):
    """Saves or updates OCR transcribed text and plagiarism detection results for a submission."""
    authorized_submission = require_submission(request, submission_id, teacher_only=True)
    body = await request.json()
    transcribed_text = body.get("transcribed_text", "")
    scan_result = body.get("scan_result")
    assignment_id = str(authorized_submission['assignment_id'])
    if body.get('assignment_id') and str(body['assignment_id']) != assignment_id:
        raise HTTPException(400, "Assignment does not match this submission.")

    if scan_result is not None:
        scan_id = scan_result.get("scanId") if isinstance(scan_result, dict) else None
        record = require_scan(request, plagiarism_db.get_scan(scan_id)) if scan_id else None
        data = (record or {}).get("result_data") or {}
        if (record or {}).get("status") != "completed" or data.get("provider") != "copyleaks" or data.get("sandbox"):
            raise HTTPException(409, "A verified completed Copyleaks scan is required. Run a new check.")
        if (record.get("submitted_text") or "") != transcribed_text:
            raise HTTPException(409, "The scan does not match the saved text. Run a new check.")
        scan_result = {"scanId": scan_id, "mode": "copyleaks", "provider": "copyleaks",
                       "score": data["plagiarism_score"], "matchedSources": data["matched_sources"],
                       "scanStatus": "Completed"}

    saved = save_results(request, submission_id, {
        "transcribed_text": transcribed_text, "scan_result": scan_result,
    })
    return {"success": True, "scan_record": saved}


@app.post("/api/plagiarism/peer-check")
async def check_peer_plagiarism(request: Request):
    """
    Checks the submitted text against other student submissions in the SAME assignment
    to detect cross-student copying (peer-to-peer plagiarism).
    """
    body = await request.json()
    text = body.get("text", "")
    submission_id = body.get("submission_id")
    assignment_id = body.get("assignment_id")
    peer_submissions = body.get("peer_submissions")

    require_assignment(request, assignment_id, teacher_only=True)
    if submission_id:
        current = require_submission(request, submission_id, teacher_only=True)
        if str(current['assignment_id']) != str(assignment_id):
            raise HTTPException(400, "Assignment does not match this submission.")
    allowed = {str(row['id']) for row in visible_submissions(request) if str(row['assignment_id']) == str(assignment_id)}
    if peer_submissions is not None:
        if not isinstance(peer_submissions, list) or any(not isinstance(p, dict) or str(p.get('id') or p.get('submission_id') or p.get('submissionId') or '') not in allowed for p in peer_submissions):
            raise HTTPException(403, "Peer submissions must belong to this assignment.")
    else:
        peer_submissions = [{'id': sid, 'text': row.get('transcribed_text') or ''}
            for sid, row in read_results(request).items() if str(sid) in allowed]

    peer_report = plagiarism_db.compute_peer_similarity(
        text=text,
        current_submission_id=submission_id,
        assignment_id=assignment_id,
        peer_submissions=peer_submissions,
    )
    return peer_report



# ==========================================
# COPYLEAKS PLAGIARISM CHECKER ENDPOINTS
# ==========================================

@app.post("/api/plagiarism/check")
async def check_plagiarism(
    file: Optional[UploadFile] = File(None),
    request: Request = None,
):
    """
    Submits student essay text or document to the Copyleaks Authenticity API.
    Enforces minimum 20 words requirement for meaningful similarity analysis.
    """
    text = ""
    file_bytes = None
    filename = None
    user_id = authenticated_account(request)["id"]
    sandbox = False

    if file:
        file_bytes = await file.read()
        filename = file.filename
    elif request:
        try:
            body = await request.json()
        except Exception:
            body = {}
        text = body.get("text", "")
        filename = body.get("filename", "essay.txt")
        # Scan ownership always comes from the verified session.
        sandbox = False

    if not text and not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Either 'text' or an uploaded 'file' is required for plagiarism scanning.",
        )

    # Validate file size if file upload (limit 25MB)
    if file_bytes and len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Document file size exceeds 25MB limit.")

    # Validate minimum text length (at least 20 words for meaningful plagiarism analysis)
    if text and not file_bytes:
        word_count = len(text.strip().split())
        if word_count < 20:
            raise HTTPException(
                status_code=400,
                detail=f"Text is too short for plagiarism detection ({word_count} words). Minimum requirement is 20 words.",
            )

    try:
        submission = copyleaks_service.submit_scan(
            text=text,
            file_bytes=file_bytes,
            filename=filename,
            user_id=user_id,
            sandbox=sandbox,
        )
        scan_id = submission["scan_id"]
        safe_filename = submission["filename"]
        is_sandbox = submission["sandbox"]
    except Exception as exc:
        raise HTTPException(502, "Copyleaks could not accept the scan. Please retry later.") from exc

    word_count = len(text.split()) if text else 0

    # Persist in database with 'processing' status
    scan_record = plagiarism_db.create_scan(
        user_id=user_id,
        scan_id=scan_id,
        filename=safe_filename,
        status="processing",
        submitted_text=text,
    )
    if word_count > 0:
        with plagiarism_db._get_connection() as conn:
            conn.execute(
                "UPDATE plagiarism_scans SET total_words = ? WHERE scan_id = ?",
                (word_count, scan_id),
            )
            conn.commit()

    return {
        "success": True,
        "scan_id": scan_id,
        "status": "processing",
        "filename": safe_filename,
        "sandbox": is_sandbox,
        "created_at": scan_record.get("created_at"),
    }


@app.post("/api/plagiarism/webhook/{status}")
async def copyleaks_webhook(status: str, request: Request):
    """
    Receives scan completion or error notifications from Copyleaks.
    Copyleaks calls /api/plagiarism/webhook/completed or /api/plagiarism/webhook/error
    """
    try:
        payload = await request.json()
    except Exception as e:
        print(f"[copyleaks webhook] invalid json: {e}", flush=True)
        return {"status": "error", "message": "Invalid JSON payload"}

    status_lower = status.lower()
    print(f"[copyleaks webhook] received event: {status_lower}", flush=True)

    scanned_doc = payload.get("scannedDocument") or {}
    scan_id = scanned_doc.get("scanId") or payload.get("scanId")

    if not scan_id or not copyleaks_service.verify_webhook(scan_id, payload.get("developerPayload")):
        raise HTTPException(403, "Invalid webhook authentication.")
    from submission_checker import record_submission_webhook
    if record_submission_webhook(scan_id, status_lower, payload):
        return {"status": "ok", "scan_id": scan_id}
    if not plagiarism_db.get_scan(scan_id):
        raise HTTPException(404, "Scan not found.")

    if not scan_id:
        print(f"[copyleaks webhook] warning: no scan_id found in payload keys: {list(payload.keys())}", flush=True)
        return {"status": "ignored", "message": "Missing scanId in payload"}

    if status_lower == "completed":
        try:
            parsed = copyleaks_service.parse_completed_payload(payload)
        except (ValueError, TypeError, KeyError):
            plagiarism_db.update_scan_failed(scan_id=scan_id, error_message="Invalid Copyleaks completion payload.")
            raise HTTPException(422, "Invalid Copyleaks completion payload.")
        updated = plagiarism_db.update_scan_completed(
            scan_id=scan_id,
            total_words=parsed["total_words"],
            plagiarism_score=parsed["plagiarism_score"],
            identical_words=parsed["identical_words"],
            result_data=parsed,
        )
        print(
            f"[copyleaks webhook] scan {scan_id} marked COMPLETED: score={parsed['plagiarism_score']}%, "
            f"identical={parsed['identical_words']}/{parsed['total_words']} words",
            flush=True,
        )
        return {"status": "ok", "scan_id": scan_id, "record": updated}

    elif status_lower in ("error", "failed"):
        error_info = str(payload.get("error") or payload.get("message") or "Copyleaks scan failed")
        updated = plagiarism_db.update_scan_failed(scan_id=scan_id, error_message=error_info)
        print(f"[copyleaks webhook] scan {scan_id} marked FAILED: {error_info}", flush=True)
        return {"status": "failed", "scan_id": scan_id, "record": updated}

    # Other informational events (e.g. creditsChecked, indexed)
    return {"status": "received", "event": status_lower, "scan_id": scan_id}


@app.get("/api/plagiarism/scans/{scan_id}")
def get_plagiarism_scan(scan_id: str, request: Request):
    """Retrieves current scan progress, score, and matched sources."""
    record = require_scan(request, plagiarism_db.get_scan(scan_id))
    if not record:
        raise HTTPException(status_code=404, detail="Plagiarism scan not found.")

    # Completion is recorded only by the authenticated provider callback.
    # Old completed records without provenance must not appear as live results.
    data = record.get("result_data") or {}
    if record.get("status") == "completed" and (data.get("provider") != "copyleaks" or data.get("sandbox")):
        return {**record, "status": "failed", "plagiarism_score": None, "result_data": None,
                "error_message": "This report is unverified. Run a new Copyleaks check."}

    return record


@app.get("/api/plagiarism/scans")
def list_plagiarism_scans(request: Request, user_id: Optional[str] = Query(None), limit: int = Query(20, ge=1, le=100)):
    """Lists recent plagiarism scans for a user."""
    account = authenticated_account(request)
    if user_id and str(user_id) != str(account['id']):
        raise HTTPException(403, "You can only view your own scans.")
    records = plagiarism_db.list_user_scans(user_id=account['id'], limit=limit)
    return [get_plagiarism_scan(row['scan_id'], request) for row in records]


@app.post("/api/plagiarism/simulate-complete/{scan_id}")
def simulate_complete_scan(scan_id: str, request: Request):
    """
    Retired simulation endpoint; never manufacture provider results.
    """
    raise HTTPException(410, "Simulated plagiarism completion is no longer supported.")


@app.post("/api/upload")
@app.post("/upload")
def upload_image(file: UploadFile = File(...)):
    started_at = time.perf_counter()
    ocr_input = prepare_ocr_input(file, started_at)
    raw_boxes = ocr_input["raw_boxes"]
    line_crops = ocr_input["line_crops"]
    detected_line_count = ocr_input["detected_line_count"]
    duplicate_line_count = ocr_input["duplicate_line_count"]
    truncated = ocr_input["truncated"]

    if not raw_boxes or not line_crops:
        return {
            "text": "",
            "lines": [],
            "boxes": [],
            "raw_boxes": raw_boxes,
            "detected_line_count": detected_line_count,
            "duplicate_line_count": duplicate_line_count,
            "processed_line_count": 0,
            "truncated": truncated,
        }

    generated_texts, generated_confs, needs_review = recognize_lines(line_crops, started_at)

    lines_with_meta = [
        {
            "text": clean_punctuation_and_casing(correct_domain_terms(text)),
            "bbox": [item["box"]["x1"], item["box"]["y1"], item["box"]["x2"], item["box"]["y2"]],
            "confidence": conf,
            "confidence_label": "review" if review else "high",
            "needs_review": review,
        }
        for text, conf, item, review in zip(generated_texts, generated_confs, line_crops, needs_review)
    ]

    full_text = format_essay_document(lines_with_meta)
    cleaned_texts = [item["text"] for item in lines_with_meta]

    print(
        f"[ocr] complete in {time.perf_counter() - started_at:.2f}s",
        flush=True,
    )

    return {
        "text": full_text,
        "lines": cleaned_texts,
        "confidences": generated_confs,
        "line_details": lines_with_meta,
        "boxes": [item["box"] for item in line_crops],
        "raw_boxes": raw_boxes,
        "detected_line_count": detected_line_count,
        "duplicate_line_count": duplicate_line_count,
        "processed_line_count": len(line_crops),
        "truncated": truncated,
    }


@app.post("/api/upload-stream")
@app.post("/upload-stream")
def upload_image_stream(file: UploadFile = File(...)):
    started_at = time.perf_counter()
    ocr_input = prepare_ocr_input(file, started_at)
    raw_boxes = ocr_input["raw_boxes"]
    line_crops = ocr_input["line_crops"]
    detected_line_count = ocr_input["detected_line_count"]
    duplicate_line_count = ocr_input["duplicate_line_count"]
    truncated = ocr_input["truncated"]

    def event_stream():
        generated_texts = []
        generated_boxes = []
        generated_confs = []
        generated_review = []

        yield encode_stream_event({
            "type": "metadata",
            "detected_line_count": detected_line_count,
            "duplicate_line_count": duplicate_line_count,
            "processed_line_count": 0,
            "truncated": truncated,
            "raw_boxes": raw_boxes,
        })

        if not line_crops:
            yield encode_stream_event({
                "type": "done",
                "text": "",
                "lines": [],
                "boxes": [],
                "raw_boxes": raw_boxes,
                "detected_line_count": detected_line_count,
                "duplicate_line_count": duplicate_line_count,
                "processed_line_count": 0,
                "truncated": truncated,
            })
            return

        for batch in recognize_line_batches(line_crops, started_at):
            generated_texts.extend(batch["lines"])
            generated_boxes.extend(batch["boxes"])
            generated_confs.extend(batch["confidences"])
            generated_review.extend(batch["needs_review"])

            current_meta = [
                {
                    "text": clean_punctuation_and_casing(correct_domain_terms(t)),
                    "bbox": [b["x1"], b["y1"], b["x2"], b["y2"]],
                }
                for t, b in zip(generated_texts, generated_boxes)
            ]
            current_full_text = format_essay_document(current_meta)
            cleaned_batch = [clean_punctuation_and_casing(correct_domain_terms(t)) for t in batch["lines"]]

            yield encode_stream_event({
                "type": "lines",
                "lines": cleaned_batch,
                "confidences": batch["confidences"],
                "boxes": batch["boxes"],
                "text": current_full_text,
                "detected_line_count": detected_line_count,
                "duplicate_line_count": duplicate_line_count,
                "processed_line_count": len(generated_texts),
                "truncated": truncated,
            })

        final_meta = [
            {
                "text": clean_punctuation_and_casing(correct_domain_terms(t)),
                "bbox": [b["x1"], b["y1"], b["x2"], b["y2"]],
                "confidence": conf,
                "confidence_label": "review" if review else "high",
                "needs_review": review,
            }
            for t, b, conf, review in zip(generated_texts, generated_boxes, generated_confs, generated_review)
        ]
        full_text = format_essay_document(final_meta)
        cleaned_texts = [item["text"] for item in final_meta]

        print(
            f"[ocr] complete in {time.perf_counter() - started_at:.2f}s",
            flush=True,
        )

        yield encode_stream_event({
            "type": "done",
            "text": full_text,
            "lines": cleaned_texts,
            "confidences": generated_confs,
            "line_details": final_meta,
            "boxes": generated_boxes,
            "raw_boxes": raw_boxes,
            "detected_line_count": detected_line_count,
            "duplicate_line_count": duplicate_line_count,
            "processed_line_count": len(generated_texts),
            "truncated": truncated,
        })

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


from submission_worker import SubmissionWorker
from local_ocr import require_local_ocr
from submission_checker import check_submission
import threading


@app.post("/local-ocr/upload-stream")
def local_upload_stream(request: Request, file: UploadFile = File(...)):
    require_local_ocr(request)
    return upload_image_stream(file)


def submission_image_ocr(data, filename):
    upload = UploadFile(filename=filename, file=io.BytesIO(data))
    result = upload_image(upload)
    if result.get('truncated'):
        raise ValueError('OCR was truncated. Increase MAX_OCR_LINES or correct the transcription.')
    return result['text']


@app.post("/api/documents/extract")
def extract_uploaded_document(file: UploadFile = File(...)):
    """Extract uploaded documents through the same path as automatic submissions."""
    from document_text import extract_document
    data = file.file.read(25 * 1024 * 1024 + 1)
    try:
        text = extract_document(data, file.filename or '', submission_image_ocr)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, "This document could not be read. Use a readable PDF, DOCX, text file, or image.") from exc
    return {"text": text}


submission_worker = SubmissionWorker(UPLOAD_DIR, submission_image_ocr, check_submission)
notification_worker = NotificationWorker()


@app.on_event("startup")
def start_submission_worker():
    threading.Thread(target=submission_worker.run, daemon=True, name='submission-worker').start()
    threading.Thread(target=notification_worker.run, daemon=True, name='notification-worker').start()


@app.on_event("shutdown")
def stop_submission_worker():
    submission_worker.stop.set()
    notification_worker.stop.set()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
