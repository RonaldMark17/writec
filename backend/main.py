import base64
import io
import json
import os
import re
import shutil
import sys
import time
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
PAD_RATIO_VERT = float(os.getenv("PAD_RATIO_VERT", "0.08"))
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

    # Overlap filter (matching reference implementation)
    filtered_boxes = []
    for b in parsed_boxes:
        if not filtered_boxes:
            filtered_boxes.append(b)
            continue
        prev = filtered_boxes[-1]
        overlap_y1 = max(prev["y1"], b["y1"])
        overlap_y2 = min(prev["y2"], b["y2"])
        overlap_h = max(0, overlap_y2 - overlap_y1)
        min_h = min(prev["height"], b["height"])

        if min_h > 0 and (overlap_h / min_h) > 0.65:
            if b["conf"] > prev["conf"]:
                filtered_boxes[-1] = b
        else:
            filtered_boxes.append(b)

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
            "conf": b["conf"],
        })

    return crops, parsed_boxes, filtered_boxes


def deskew_and_clean_image(raw_img: Image.Image) -> Image.Image:
    """
    Detects paper tilt and automatically deskews the photo up to +/- 45 degrees.
    Balances contrast for low-lighting or shadowed phone captures.
    """
    try:
        img_np = np.array(raw_img)
        if len(img_np.shape) == 2:
            gray = img_np
        else:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 15
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
        dilated = cv2.dilate(thresh, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        angles = []
        for c in contours:
            if cv2.contourArea(c) < 100:
                continue
            rect = cv2.minAreaRect(c)
            angle = rect[-1]
            if angle < -45:
                angle = 90 + angle
            elif angle > 45:
                angle = angle - 90
            if abs(angle) <= 45.0:
                angles.append(angle)

        if len(angles) >= 3:
            median_angle = float(np.median(angles))
            if abs(median_angle) >= 0.75:
                print(f"[ocr] auto-deskew rotating by {-median_angle:.2f} deg", flush=True)
                return raw_img.rotate(-median_angle, resample=Image.BILINEAR, expand=False)
    except Exception as exc:
        print(f"[ocr] deskew notice: {exc}", flush=True)

    return raw_img


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

    for index in range(0, len(line_crops), OCR_BATCH_SIZE):
        batch_items = line_crops[index : index + OCR_BATCH_SIZE]
        batch_images = [item["crop"] for item in batch_items]

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

            generated_ids = trocr_model.generate(pixel_values, **gen_kwargs)

        batch_texts = [
            text.strip()
            for text in processor.batch_decode(
                generated_ids,
                skip_special_tokens=True,
            )
        ]

        # Calculate confidence per line
        batch_confs = []
        for item, text in zip(batch_items, batch_texts):
            yolo_conf = float(item.get("conf", 0.85))
            word_count = len(text.split())
            length_factor = 0.95 if word_count >= 3 else 0.85
            blended = round(min(0.99, max(0.50, (yolo_conf * 0.35) + (length_factor * 0.65))), 2)
            batch_confs.append(blended)

        print(
            f"[ocr] trocr batch {index // OCR_BATCH_SIZE + 1} "
            f"lines={index + 1}-{index + len(batch_items)}/{len(line_crops)} "
            f"tokens_cap={dynamic_max_tokens} "
            f"done in {time.perf_counter() - started_at:.2f}s",
            flush=True,
        )

        yield {
            "start_index": index,
            "lines": batch_texts,
            "confidences": batch_confs,
            "boxes": [item["box"] for item in batch_items],
        }


def recognize_lines(line_crops, started_at, num_beams=None):
    """Recognizes lines and preserves exact reading order."""
    generated_texts = []
    generated_confs = []
    for batch in recognize_line_batches(line_crops, started_at, num_beams=num_beams):
        generated_texts.extend(batch["lines"])
        generated_confs.extend(batch.get("confidences", []))
    return generated_texts, generated_confs


def prepare_ocr_input(file, started_at):
    safe_filename = Path(file.filename or "upload.png").name
    filepath = UPLOAD_DIR / safe_filename

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

app = FastAPI()

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

# Background synchronization to Supabase for all local plagiarism.db records
try:
    from supabase_sync import sync_all_from_local_db
    import threading
    threading.Thread(target=sync_all_from_local_db, daemon=True).start()
except Exception as _e:
    print(f"[supabase sync] startup sync notice: {_e}", flush=True)

os.makedirs(UPLOAD_DIR / "submissions", exist_ok=True)

def _fetch_from_supabase_storage(relative_path: str, filename: str) -> Optional[bytes]:
    """Downloads a file from Supabase Storage 'essay-submissions', supporting deep nested paths."""
    try:
        from supabase_sync import SUPABASE_URL, SUPABASE_KEY
        import urllib.request
        import json

        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

        # 1. Direct fetch attempts
        direct_paths = [relative_path]
        if filename and filename != relative_path:
            direct_paths.append(filename)

        for p in direct_paths:
            clean = p.replace("essay-submissions/", "").lstrip("/")
            for endpoint in ["authenticated", "public"]:
                url = f"{SUPABASE_URL}/storage/v1/object/{endpoint}/essay-submissions/{clean}"
                try:
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        if resp.status == 200:
                            return resp.read()
                except Exception:
                    pass

        # 2. Deep recursive search in bucket if target is just a filename
        target_name = filename or Path(relative_path).name
        if target_name:
            try:
                list_url = f"{SUPABASE_URL}/storage/v1/object/list/essay-submissions"
                req = urllib.request.Request(
                    list_url,
                    data=json.dumps({"prefix": "", "limit": 100}).encode("utf-8"),
                    headers={**headers, "Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    top_folders = json.loads(resp.read().decode("utf-8"))

                for f1 in (top_folders or []):
                    if not f1.get("id"):
                        p1 = f1["name"]
                        req2 = urllib.request.Request(
                            list_url,
                            data=json.dumps({"prefix": p1, "limit": 100}).encode("utf-8"),
                            headers={**headers, "Content-Type": "application/json"},
                        )
                        with urllib.request.urlopen(req2, timeout=5) as resp2:
                            sub_folders = json.loads(resp2.read().decode("utf-8"))

                        for f2 in (sub_folders or []):
                            p2 = f"{p1}/{f2['name']}"
                            req3 = urllib.request.Request(
                                list_url,
                                data=json.dumps({"prefix": p2, "limit": 100}).encode("utf-8"),
                                headers={**headers, "Content-Type": "application/json"},
                            )
                            with urllib.request.urlopen(req3, timeout=5) as resp3:
                                files = json.loads(resp3.read().decode("utf-8"))

                            for f in (files or []):
                                if f.get("name") == target_name:
                                    exact_path = f"{p2}/{target_name}"
                                    get_url = f"{SUPABASE_URL}/storage/v1/object/authenticated/essay-submissions/{exact_path}"
                                    req_file = urllib.request.Request(get_url, headers=headers)
                                    with urllib.request.urlopen(req_file, timeout=6) as fresp:
                                        if fresp.status == 200:
                                            return fresp.read()
            except Exception as _e:
                print(f"[supabase storage] deep search warning: {_e}", flush=True)

    except Exception as e:
        print(f"[supabase storage] fetch error: {e}", flush=True)

    return None


# Serve uploaded files with explicit CORS headers and automatic Supabase Storage resolution.
@app.api_route("/uploads/{file_path:path}", methods=["GET", "HEAD", "OPTIONS"])
async def serve_upload(file_path: str):
    filename = Path(file_path).name
    candidates = [
        UPLOAD_DIR / file_path,
        UPLOAD_DIR / filename,
        UPLOAD_DIR / "submissions" / filename,
    ]

    found = next((c for c in candidates if c.exists() and c.is_file()), None)

    # If still not found, search UPLOAD_DIR recursively for filename
    if not found and filename:
        for root, _, files in os.walk(UPLOAD_DIR):
            if filename in files:
                found = Path(root) / filename
                break

    # If still not found, fetch from Supabase Storage and cache locally
    if not found:
        clean_path = file_path.replace("submissions/", "").lstrip("/")
        data = _fetch_from_supabase_storage(clean_path, filename)
        if data:
            save_path = UPLOAD_DIR / "submissions" / filename
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(data)
            found = save_path

    if not found or not found.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Mirror to ensure both /uploads/<name> and /uploads/submissions/<name> are always cached
    try:
        f_sub = UPLOAD_DIR / "submissions" / filename
        f_root = UPLOAD_DIR / filename
        if not f_sub.exists():
            f_sub.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(found, f_sub)
        if not f_root.exists():
            shutil.copy2(found, f_root)
    except Exception:
        pass

    return FileResponse(
        str(found),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=3600",
        },
    )


@app.get("/api/storage/file")
async def proxy_storage_file(path: str = Query(..., description="Supabase storage relative path or filename")):
    """
    Direct proxy to download and serve files from Supabase Storage 'essay-submissions' bucket.
    """
    filename = Path(path).name
    clean = path.replace("essay-submissions/", "").lstrip("/")

    data = _fetch_from_supabase_storage(clean, filename)
    if data:
        # Determine media type
        suffix = Path(filename).suffix.lower()
        media_type = "image/png" if suffix == ".png" else "image/jpeg"
        from fastapi.responses import Response
        return Response(
            content=data,
            media_type=media_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
        )

    raise HTTPException(status_code=404, detail="File not found in Supabase Storage.")

# ==========================================
# API ROUTES
# ==========================================


@app.get("/health")
async def health():
    return {
        "status": "ok",
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
def upload_submission_file(file: UploadFile = File(...)):
    """Uploads student essay files locally when Supabase bucket is missing or fails."""
    sub_dir = UPLOAD_DIR / "submissions"
    sub_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{int(time.time() * 1000)}-{Path(file.filename or 'submission.jpg').name}"
    target_path = sub_dir / safe_name
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    file_url = f"http://localhost:8000/uploads/submissions/{safe_name}"
    return {
        "success": True,
        "file_url": file_url,
        "filename": safe_name,
        "size": target_path.stat().st_size,
    }


@app.get("/api/submissions/grades")
def get_submission_grades():
    """Retrieves all graded submissions from local storage."""
    return plagiarism_db.get_submission_grades()


@app.post("/api/submissions/{submission_id}/grade")
async def save_submission_grade_endpoint(submission_id: str, request: Request):
    """Saves or updates the grade and feedback for a student submission."""
    body = await request.json()
    grade = body.get("grade", "")
    feedback = body.get("feedback", "")
    status = body.get("status", "graded")
    transcribed_text = body.get("transcribed_text")
    scan_result = body.get("scan_result")
    assignment_id = body.get("assignment_id")
    saved = plagiarism_db.save_submission_grade(
        submission_id=submission_id,
        grade=str(grade),
        feedback=str(feedback),
        status=status,
        transcribed_text=transcribed_text,
        scan_result=scan_result,
        assignment_id=assignment_id,
    )
    return {"success": True, "grade_record": saved}


@app.post("/api/submissions/{submission_id}/scan")
async def save_submission_scan_endpoint(submission_id: str, request: Request):
    """Saves or updates OCR transcribed text and plagiarism detection results for a submission."""
    body = await request.json()
    transcribed_text = body.get("transcribed_text", "")
    scan_result = body.get("scan_result")
    assignment_id = body.get("assignment_id")

    # Enrich with Copyleaks matched sources if missing or containing Wikipedia/dummy placeholder
    if isinstance(scan_result, dict):
        sources = scan_result.get("matchedSources") or scan_result.get("matched_sources") or []
        has_invalid = any(
            "wikipedia" in str(s.get("url", "")).lower()
            or "wikipedia" in str(s.get("title", "")).lower()
            or "Academic_integrity" in str(s.get("url", ""))
            or "Online Reference" in str(s.get("title", ""))
            for s in sources
        )
        if not sources or has_invalid:
            from source_finder import find_copyleaks_sources
            real_sources = find_copyleaks_sources(transcribed_text)
            scan_result["matchedSources"] = real_sources
            scan_result["matched_sources"] = real_sources
            if "result_data" in scan_result and isinstance(scan_result["result_data"], dict):
                scan_result["result_data"]["matched_sources"] = real_sources

        # Attach highlighted_sentences for visual sentence and word plagiarism highlighting
        sources_to_use = scan_result.get("matchedSources") or scan_result.get("matched_sources") or []
        peer_snippets = (scan_result.get("peerSimilarity") or {}).get("matching_snippets") or []
        from source_finder import extract_plagiarism_highlights
        highlights = extract_plagiarism_highlights(transcribed_text, sources_to_use, peer_snippets)
        scan_result["highlighted_sentences"] = highlights
        if "result_data" in scan_result and isinstance(scan_result["result_data"], dict):
            scan_result["result_data"]["highlighted_sentences"] = highlights

    saved = plagiarism_db.save_submission_scan(
        submission_id=submission_id,
        transcribed_text=transcribed_text,
        scan_result=scan_result,
        assignment_id=assignment_id,
    )
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
    user_id = "anonymous"
    sandbox = None

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
        user_id = body.get("user_id", "anonymous")
        sandbox = body.get("sandbox")

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
        print(f"[plagiarism] Copyleaks submission notice: {exc} - activating internal similarity engine fallback", flush=True)
        scan_id = f"local-{int(time.time())}-{uuid.uuid4().hex[:12]}"
        safe_filename = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", (filename or "essay.txt")).strip() or "essay.txt"
        if not safe_filename.endswith(".txt"):
            safe_filename += ".txt"

        internal_res = plagiarism_db.find_peer_matches(text or "", threshold=0.15) if text else {"max_similarity": 0, "matches": []}
        max_sim = float(internal_res.get("max_similarity", 0.0))
        from source_finder import find_copyleaks_sources, extract_plagiarism_highlights
        real_sources = find_copyleaks_sources(text or "")
        highlighted = extract_plagiarism_highlights(text or "", real_sources)
        total_w = len((text or "").split())
        unique_matched = set()
        for h in highlighted:
            for w in h.get("matched_words", []):
                if len(w) >= 3:
                    unique_matched.add(w.lower())
        identical = len(unique_matched)
        score = round(min(100.0, (identical / max(1, total_w)) * 100.0), 1) if total_w > 0 and identical > 0 else round(max_sim * 100, 1)

        scan_record = plagiarism_db.create_scan(
            user_id=user_id,
            scan_id=scan_id,
            filename=safe_filename,
            status="completed",
            submitted_text=text,
        )
        resolved_data = {
            "total_words": total_w,
            "identical_words": identical,
            "plagiarism_score": score,
            "matched_sources": real_sources,
            "highlighted_sentences": highlighted,
        }
        plagiarism_db.update_scan_completed(
            scan_id=scan_id,
            total_words=total_w,
            plagiarism_score=score,
            identical_words=identical,
            result_data=resolved_data,
        )
        return {
            "success": True,
            "scan_id": scan_id,
            "status": "completed",
            "score": score,
            "filename": safe_filename,
            "sandbox": True,
            "is_local_fallback": True,
            "created_at": scan_record.get("created_at"),
            "result_data": resolved_data,
        }

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
    scan_id = scanned_doc.get("scanId") or payload.get("scanId") or payload.get("developerPayload")

    if not scan_id:
        print(f"[copyleaks webhook] warning: no scan_id found in payload keys: {list(payload.keys())}", flush=True)
        return {"status": "ignored", "message": "Missing scanId in payload"}

    if status_lower == "completed":
        parsed = copyleaks_service.parse_completed_payload(payload)
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
def get_plagiarism_scan(scan_id: str):
    """Retrieves current scan progress, score, and matched sources."""
    record = plagiarism_db.get_scan(scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="Plagiarism scan not found.")

    # 1. Attempt live check directly from Copyleaks Scans Result API if still processing
    if record.get("status") == "processing":
        try:
            live_result = copyleaks_service.get_scan_results(scan_id)
            if live_result and (live_result.get("matched_sources") or live_result.get("total_words", 0) > 0):
                record = plagiarism_db.update_scan_completed(
                    scan_id=scan_id,
                    total_words=live_result["total_words"],
                    plagiarism_score=live_result["plagiarism_score"],
                    identical_words=live_result["identical_words"],
                    result_data=live_result,
                )
        except Exception as e:
            print(f"[get_plagiarism_scan] live copyleaks polling error: {e}", flush=True)

    # 2. Graceful resolution for local development when running on localhost without an external webhook tunnel
    if record.get("status") == "processing":
        try:
            created_dt = datetime.fromisoformat(record["created_at"])
            elapsed = (datetime.now(timezone.utc) - created_dt).total_seconds()
        except Exception:
            elapsed = 0

        if elapsed >= 3:
            submitted_text = record.get("submitted_text") or ""
            total_words = int(record.get("total_words") or len(submitted_text.split()) or 120)
            from source_finder import find_copyleaks_sources, extract_plagiarism_highlights
            matched_sources = find_copyleaks_sources(submitted_text)
            highlighted = extract_plagiarism_highlights(submitted_text, matched_sources)

            # Calculate actual count of unique matched words in highlighted passages
            unique_matched = set()
            for h in highlighted:
                for w in h.get("matched_words", []):
                    if len(w) >= 3:
                        unique_matched.add(w.lower())

            identical = len(unique_matched)
            if total_words > 0 and identical > 0:
                score = round(min(100.0, (identical / total_words) * 100.0), 1)
            else:
                score = 0.0

            resolved_data = {
                "total_words": total_words,
                "identical_words": identical,
                "plagiarism_score": score,
                "matched_sources": matched_sources,
                "highlighted_sentences": highlighted,
            }
            record = plagiarism_db.update_scan_completed(
                scan_id=scan_id,
                total_words=total_words,
                plagiarism_score=score,
                identical_words=identical,
                result_data=resolved_data,
            )

    # 3. If already stored, check if it has Wikipedia or dummy sources that must be purged
    res_data = record.get("result_data")
    if isinstance(res_data, dict):
        matched = res_data.get("matched_sources") or []
        has_invalid = any(
            "wikipedia" in str(s.get("url", "")).lower()
            or "wikipedia" in str(s.get("title", "")).lower()
            or "Academic_integrity" in str(s.get("url", ""))
            or "Online Reference" in str(s.get("title", ""))
            or str(s.get("url", "")) == "https://copyleaks.com/plagiarism-checker"
            for s in matched
        )
        if has_invalid or not matched or "highlighted_sentences" not in res_data:
            submitted_text = record.get("submitted_text") or ""
            if submitted_text:
                from source_finder import find_copyleaks_sources, extract_plagiarism_highlights
                new_sources = find_copyleaks_sources(submitted_text) if (has_invalid or not matched) else matched
                if new_sources:
                    total_words = int(record.get("total_words") or len(submitted_text.split()) or 120)
                    identical = sum(int(s.get("matched_words", 0)) for s in new_sources)
                    score = round(min(100.0, (identical / total_words) * 100.0), 1) if total_words > 0 else 12.5
                    res_data["matched_sources"] = new_sources
                    res_data["identical_words"] = identical
                    res_data["plagiarism_score"] = score
                    res_data["highlighted_sentences"] = extract_plagiarism_highlights(submitted_text, new_sources)
                    record = plagiarism_db.update_scan_completed(
                        scan_id=scan_id,
                        total_words=total_words,
                        plagiarism_score=score,
                        identical_words=identical,
                        result_data=res_data,
                    )

    return record


@app.get("/api/plagiarism/scans")
def list_plagiarism_scans(user_id: str = Query("anonymous"), limit: int = Query(20)):
    """Lists recent plagiarism scans for a user."""
    return plagiarism_db.list_user_scans(user_id=user_id, limit=limit)


@app.post("/api/plagiarism/simulate-complete/{scan_id}")
def simulate_complete_scan(scan_id: str):
    """
    Developer helper to simulate completion when testing in local offline environments.
    """
    record = plagiarism_db.get_scan(scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="Scan not found.")

    submitted_text = record.get("submitted_text") or ""
    from source_finder import find_real_matching_sources
    matched_sources = find_real_matching_sources(submitted_text)
    total_words = int(record.get("total_words") or len(submitted_text.split()) or 150)
    identical = sum(int(s.get("matched_words", 0)) for s in matched_sources)
    score = round(min(100.0, (identical / total_words) * 100.0), 1) if total_words > 0 else 12.5

    simulated_results = {
        "total_words": total_words,
        "identical_words": identical,
        "minor_words": int(identical * 0.2),
        "related_words": int(identical * 0.1),
        "plagiarism_score": score,
        "matched_sources": matched_sources,
    }

    updated = plagiarism_db.update_scan_completed(
        scan_id=scan_id,
        total_words=total_words,
        plagiarism_score=score,
        identical_words=identical,
        result_data=simulated_results,
    )
    return {"success": True, "record": updated}


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

    generated_texts, generated_confs = recognize_lines(line_crops, started_at)

    lines_with_meta = [
        {
            "text": clean_punctuation_and_casing(correct_domain_terms(text)),
            "bbox": [item["box"]["x1"], item["box"]["y1"], item["box"]["x2"], item["box"]["y2"]],
            "confidence": conf,
            "confidence_label": "high" if conf >= 0.75 else "review",
        }
        for text, conf, item in zip(generated_texts, generated_confs, line_crops)
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
            }
            for t, b in zip(generated_texts, generated_boxes)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
