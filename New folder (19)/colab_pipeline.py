"""
================================================================================
HANDWRITTEN ESSAY OCR PIPELINE (YOLO Line Detection + Fine-Tuned TrOCR)
Optimized for Google Colab & Local Execution
Includes:
- YOLO IoU Non-Maximum Suppression (iou=0.40) to kill duplicate line boxes
- Centroid vertical sorting for stable reading order
- Adaptive padding so line crops don't bleed into adjacent lines
- CLAHE contrast normalization for clean ink visibility
- Tuned TrOCR beam search (repetition_penalty=1.2, no_repeat_ngram_size=3)
================================================================================
"""

import os
import torch
import cv2
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt
from ultralytics import YOLO
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from essay_formatter import format_essay_document

# ------------------------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------------------------
YOLO_MODEL_PATH = "/content/best.pt"
TROCR_MODEL_DIR = "/content/my_trocr_model"
IMAGE_PATH      = "/content/essay.jpg"
OUTPUT_TXT_PATH = "/content/transcription.txt"

# Optimization Parameters
YOLO_CONF_THRES  = 0.25
YOLO_IOU_THRES   = 0.40   # Crucial: merges overlapping boxes
YOLO_IMG_SIZE    = 1024   # Matches your training resolution
BATCH_SIZE       = 4
PAD_RATIO_VERT   = 0.08   # Max 8% height padding
PAD_PX_HORIZ     = 6      # 6px horizontal safety margin


def get_device():
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"[+] Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        print("[!] CUDA not available. Running on CPU.")
    return device


def load_models(yolo_path, trocr_dir, device):
    print(f"\n[1/4] Loading YOLO line detection model from: {yolo_path}")
    yolo_model = YOLO(yolo_path)

    print(f"[2/4] Loading fine-tuned TrOCR processor & model from: {trocr_dir}")
    processor = TrOCRProcessor.from_pretrained(trocr_dir)
    trocr_model = VisionEncoderDecoderModel.from_pretrained(trocr_dir).to(device)
    trocr_model.eval()

    return yolo_model, processor, trocr_model


def preprocess_crop_clahe(crop_pil):
    """Enhance stroke contrast against yellow/dark backgrounds."""
    img_np = np.array(crop_pil)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return Image.fromarray(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB))


def extract_adaptive_line_crops(raw_img, boxes):
    """
    Sorts boxes by vertical centroid and applies adaptive padding to prevent
    capturing letters from neighboring lines.
    """
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

    # Sort strictly by vertical centroid
    parsed_boxes.sort(key=lambda b: b["centroid_y"])

    # Eliminate residual heavy vertical overlaps (> 65%)
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

    # Adaptive padding
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

        crop = raw_img.crop((cx1, cy1, cx2, cy2))
        enhanced_crop = preprocess_crop_clahe(crop)

        crops.append(enhanced_crop)
        metadata.append({
            "crop_coords": (cx1, cy1, cx2, cy2),
            "conf": b["conf"]
        })

    return crops, metadata


def detect_and_crop_lines(yolo_model, image_path):
    print(f"\n[3/4] Detecting lines in: {image_path}")
    raw_img = Image.open(image_path).convert("RGB")

    results = list(yolo_model.predict(
        source=image_path,
        conf=YOLO_CONF_THRES,
        iou=YOLO_IOU_THRES,
        imgsz=YOLO_IMG_SIZE,
        verbose=False
    ))
    raw_boxes = getattr(results[0], 'boxes', [])
    print(f"[+] YOLO detected {len(raw_boxes)} lines.")

    crops, metadata = extract_adaptive_line_crops(raw_img, raw_boxes)
    print(f"[+] Filtered and padded into {len(crops)} clean lines.")
    return crops, raw_img, metadata


def transcribe_crops(processor, trocr_model, crops, device, batch_size=BATCH_SIZE):
    print(f"\n[4/4] Transcribing {len(crops)} lines with fine-tuned TrOCR...")
    transcribed_lines = []

    for i in range(0, len(crops), batch_size):
        batch_crops = crops[i:i + batch_size]
        pixel_values = processor(images=batch_crops, return_tensors="pt").pixel_values.to(device)

        with torch.no_grad():
            generated_ids = trocr_model.generate(
                pixel_values,
                max_new_tokens=64,
                num_beams=4 if device.type == "cuda" else 1,
                repetition_penalty=1.2,
                no_repeat_ngram_size=3,
                length_penalty=1.0,
                use_cache=True,
                early_stopping=True
            )

        batch_preds = processor.batch_decode(generated_ids, skip_special_tokens=True)
        for text in batch_preds:
            transcribed_lines.append(text.strip())

        batch_end = min(i + batch_size, len(crops))
        print(f"    - Processed lines {i + 1} to {batch_end} / {len(crops)}")

    return transcribed_lines


def run_pipeline(yolo_path=YOLO_MODEL_PATH,
                 trocr_dir=TROCR_MODEL_DIR,
                 image_path=IMAGE_PATH,
                 output_txt=OUTPUT_TXT_PATH):
    device = get_device()
    yolo_model, processor, trocr_model = load_models(yolo_path, trocr_dir, device)

    crops, raw_img, line_metadata = detect_and_crop_lines(yolo_model, image_path)
    if not crops:
        return ""

    batch_sz = 8 if device.type == "cuda" else 4
    transcribed_lines = transcribe_crops(processor, trocr_model, crops, device, batch_size=batch_sz)
    
    # Format into ground-truth matching document structure
    lines_with_meta = [{"text": t, "bbox": m["crop_coords"]} for t, m in zip(transcribed_lines, line_metadata)]
    final_text = format_essay_document(lines_with_meta)

    with open(output_txt, "w", encoding="utf-8") as f:
        f.write(final_text)

    print(f"\n[+] Final transcription saved to: {output_txt}")
    return final_text


if __name__ == "__main__":
    run_pipeline()
