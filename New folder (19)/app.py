"""
================================================================================
FLASK WEB APPLICATION: HANDWRITTEN ESSAY OCR
Line Detection (YOLO) + Handwritten Recognition (Fine-Tuned TrOCR)
================================================================================
"""

import os
import io
import time
import base64
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file
import torch
import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from essay_formatter import format_essay_document, correct_domain_terms, clean_punctuation_and_casing

BASE_DIR = Path(__file__).resolve().parent
YOLO_MODEL_PATH = str(BASE_DIR / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "weights" / "best.pt")
TROCR_MODEL_DIR = str(BASE_DIR / "final_model")

# Configuration
YOLO_CONF_THRES = 0.25
YOLO_IOU_THRES  = 0.40
YOLO_IMG_SIZE   = 1024
BATCH_SIZE      = 4
PAD_RATIO_VERT  = 0.08
PAD_PX_HORIZ    = 6

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25 MB max upload

# Global Model Cache (Singleton)
device = None
yolo_model = None
trocr_processor = None
trocr_model = None


def init_models():
    global device, yolo_model, trocr_processor, trocr_model
    if yolo_model is not None and trocr_model is not None:
        return

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[+] Initializing OCR Pipeline on: {device}")

    print("[1/2] Loading YOLO Line Detection model...")
    yolo_model = YOLO(YOLO_MODEL_PATH)

    print("[2/2] Loading Fine-Tuned TrOCR...")
    trocr_processor = TrOCRProcessor.from_pretrained(TROCR_MODEL_DIR)
    trocr_model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL_DIR).to(device)
    trocr_model.eval()
    print("[+] All models successfully loaded into memory!")


def preprocess_crop_clahe(crop_pil):
    img_np = np.array(crop_pil)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return Image.fromarray(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB))


def extract_adaptive_line_crops(raw_img, boxes):
    img_w, img_h = raw_img.size
    parsed_boxes = []
    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf = float(box.conf[0])
        parsed_boxes.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "centroid_y": (y1 + y2) / 2.0,
            "height": y2 - y1,
            "conf": conf
        })

    parsed_boxes.sort(key=lambda b: b["centroid_y"])

    # Overlap filter
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
    metadata = []
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

        crop_pil = raw_img.crop((cx1, cy1, cx2, cy2))
        enhanced_crop = preprocess_crop_clahe(crop_pil)

        crops.append(enhanced_crop)
        metadata.append({
            "bbox": [cx1, cy1, cx2, cy2],
            "conf": b["conf"]
        })

    return crops, metadata


def image_to_base64(pil_img, format="JPEG"):
    buffered = io.BytesIO()
    pil_img.save(buffered, format=format, quality=85)
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/{format.lower()};base64,{img_str}"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status_endpoint():
    init_models()
    is_cuda = torch.cuda.is_available()
    dev_name = torch.cuda.get_device_name(0) if is_cuda else f"CPU ({torch.get_num_threads()} Cores)"
    return jsonify({
        "status": "ready",
        "is_cuda": is_cuda,
        "device_name": dev_name,
        "batch_size": BATCH_SIZE
    })


@app.route("/sample/<filename>")
def serve_sample(filename):
    allowed = ["1.jpg", "2.jpg"]
    if filename in allowed:
        file_path = BASE_DIR / filename
        if file_path.exists():
            return send_file(str(file_path), mimetype="image/jpeg")
    return jsonify({"error": "Sample not found"}), 404


@app.route("/api/transcribe", methods=["POST"])
def transcribe_endpoint():
    start_time = time.time()
    init_models()

    raw_img = None
    filename = "uploaded_image.jpg"
    speed_mode = request.form.get("speed_mode", "gpu_beam")

    # Check for sample preset or file upload
    if "sample" in request.form:
        sample_name = request.form["sample"]
        sample_path = BASE_DIR / sample_name
        if sample_path.exists():
            raw_img = Image.open(sample_path).convert("RGB")
            filename = sample_name
    elif "image" in request.files:
        file = request.files["image"]
        if file and file.filename != "":
            raw_img = Image.open(file.stream).convert("RGB")
            filename = file.filename

    if raw_img is None:
        return jsonify({"success": False, "error": "No valid image provided."}), 400

    # 1. Run YOLO Line Detection
    img_cv = cv2.cvtColor(np.array(raw_img), cv2.COLOR_RGB2BGR)
    results = list(yolo_model.predict(
        source=img_cv,
        conf=YOLO_CONF_THRES,
        iou=YOLO_IOU_THRES,
        imgsz=YOLO_IMG_SIZE,
        verbose=False
    ))
    raw_boxes = getattr(results[0], 'boxes', [])

    if len(raw_boxes) == 0:
        return jsonify({
            "success": True,
            "full_text": "",
            "lines": [],
            "overlay_image": image_to_base64(raw_img),
            "stats": {
                "line_count": 0,
                "word_count": 0,
                "char_count": 0,
                "time_seconds": round(time.time() - start_time, 2)
            },
            "message": "No text lines detected in this image."
        })

    # 2. Adaptive Line Extraction
    crops, metadata = extract_adaptive_line_crops(raw_img, raw_boxes)

    # 3. TrOCR Batch Recognition
    if speed_mode == "fast_greedy":
        num_beams = 1
    else:
        num_beams = 4 if device.type == "cuda" else 2

    recognized_texts = []

    for i in range(0, len(crops), BATCH_SIZE):
        batch = crops[i:i + BATCH_SIZE]
        pixel_values = trocr_processor(images=batch, return_tensors="pt").pixel_values.to(device)

        with torch.no_grad():
            gen_kwargs = {
                "max_new_tokens": 64,
                "repetition_penalty": 1.2,
                "use_cache": True,
                "early_stopping": True
            }
            if num_beams > 1:
                gen_kwargs["num_beams"] = num_beams
                gen_kwargs["no_repeat_ngram_size"] = 3

            generated_ids = trocr_model.generate(pixel_values, **gen_kwargs)

        preds = trocr_processor.batch_decode(generated_ids, skip_special_tokens=True)
        for t in preds:
            recognized_texts.append(t.strip())

    # 4. Generate Visual Debug Overlay Image
    vis_img = np.array(raw_img).copy()
    lines_output = []

    for idx, (crop_pil, meta, text) in enumerate(zip(crops, metadata, recognized_texts)):
        cx1, cy1, cx2, cy2 = meta["bbox"]
        # Draw bounding rectangle
        cv2.rectangle(vis_img, (cx1, cy1), (cx2, cy2), (34, 197, 94), 2)
        # Put badge label
        badge_text = str(idx + 1)
        cv2.rectangle(vis_img, (max(0, cx1 - 42), cy1 + 2), (max(0, cx1 - 6), cy1 + 28), (34, 197, 94), -1)
        cv2.putText(vis_img, badge_text, (max(4, cx1 - 36), cy1 + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        # Include small crop base64 for line preview
        crop_thumb = crop_pil.copy()
        crop_thumb.thumbnail((450, 80))

        cleaned_line = clean_punctuation_and_casing(correct_domain_terms(text))
        lines_output.append({
            "line_num": idx + 1,
            "text": cleaned_line,
            "raw_text": text,
            "bbox": [cx1, cy1, cx2, cy2],
            "crop_thumb": image_to_base64(crop_thumb)
        })

    overlay_base64 = image_to_base64(Image.fromarray(vis_img))
    full_text = format_essay_document(lines_output)
    elapsed = round(time.time() - start_time, 2)
    words = len(full_text.split())
    chars = len(full_text)

    return jsonify({
        "success": True,
        "filename": filename,
        "full_text": full_text,
        "lines": lines_output,
        "overlay_image": overlay_base64,
        "stats": {
            "line_count": len(lines_output),
            "word_count": words,
            "char_count": chars,
            "time_seconds": elapsed,
            "device": str(device).upper()
        }
    })


if __name__ == "__main__":
    print("[*] Pre-warming models...")
    init_models()
    print("[*] Starting Flask Web Server on http://127.0.0.1:5050")
    app.run(host="127.0.0.1", port=5050, debug=False)
