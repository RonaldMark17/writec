"""
================================================================================
FAST & OPTIMIZED TEST SUITE FOR 1.jpg and 2.jpg
Features:
- Adaptive CPU / GPU speed: uses greedy decoding on CPU (5x faster) and beam search on GPU
- YOLO IoU NMS (iou=0.40) to eliminate duplicate line boxes
- Centroid vertical sorting for stable reading order
- Adaptive vertical padding (prevents intrusion into adjacent text lines)
- CLAHE contrast enhancement for standardized ink visibility
================================================================================
"""

import os
from pathlib import Path
import torch
import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from essay_formatter import format_essay_document

BASE_DIR = Path(__file__).resolve().parent
YOLO_MODEL_PATH = str(BASE_DIR / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "weights" / "best.pt")
TROCR_MODEL_DIR = str(BASE_DIR / "final_model")

TEST_IMAGES = [
    str(BASE_DIR / "1.jpg"),
    str(BASE_DIR / "2.jpg")
]

# Optimized parameters
YOLO_CONF_THRES  = 0.25
YOLO_IOU_THRES   = 0.40    # Eliminates duplicate line box predictions
YOLO_IMG_SIZE    = 1024
BATCH_SIZE       = 4
PAD_RATIO_VERT   = 0.08    # Max 8% height margin
PAD_PX_HORIZ     = 6       # 6px horizontal safety margin


def get_device():
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"[+] CUDA GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        print("[!] Running on CPU (using fast greedy decoding for rapid testing).")
    return device


def preprocess_crop_clahe(crop_pil):
    """
    Applies CLAHE contrast enhancement to normalize ink vs paper background.
    """
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

    # Filter heavy overlaps (> 65%)
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

        crop = raw_img.crop((cx1, cy1, cx2, cy2))
        enhanced_crop = preprocess_crop_clahe(crop)

        crops.append(enhanced_crop)
        metadata.append({
            "crop_coords": (cx1, cy1, cx2, cy2),
            "conf": b["conf"]
        })

    return crops, metadata


def process_image(img_path, yolo_model, processor, trocr_model, device):
    stem = Path(img_path).stem
    out_txt_path = BASE_DIR / f"{stem}_transcription.txt"
    out_vis_path = BASE_DIR / f"{stem}_detected_lines.png"

    print(f"\n=======================================================")
    print(f" Processing: {Path(img_path).name}")
    print(f"=======================================================")

    raw_img = Image.open(img_path).convert("RGB")

    results = list(yolo_model.predict(
        source=img_path,
        conf=YOLO_CONF_THRES,
        iou=YOLO_IOU_THRES,
        imgsz=YOLO_IMG_SIZE,
        verbose=False
    ))
    raw_boxes = getattr(results[0], 'boxes', [])
    print(f"[+] YOLO raw detected lines: {len(raw_boxes)}")

    crops, line_metadata = extract_adaptive_line_crops(raw_img, raw_boxes)
    print(f"[+] Refined lines for TrOCR: {len(crops)}")

    if not crops:
        print("[!] No lines detected!")
        return

    # Use fast decoding on CPU (beam=1) and beam=4 on GPU
    num_beams = 4 if device.type == "cuda" else 1

    print(f"[+] Transcribing with TrOCR (beams = {num_beams}, batch size = {BATCH_SIZE})...")
    recognized_lines = []

    for i in range(0, len(crops), BATCH_SIZE):
        batch = crops[i:i + BATCH_SIZE]
        pixel_values = processor(images=batch, return_tensors="pt").pixel_values.to(device)

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

        preds = processor.batch_decode(generated_ids, skip_special_tokens=True)
        for t in preds:
            cleaned = t.strip()
            recognized_lines.append(cleaned)

        print(f"    - Processed lines {min(i + BATCH_SIZE, len(crops))} / {len(crops)}")

    lines_with_meta = [{"text": t, "bbox": m["crop_coords"]} for t, m in zip(recognized_lines, line_metadata)]
    full_text = format_essay_document(lines_with_meta)

    # Save transcription text
    with open(out_txt_path, "w", encoding="utf-8") as f:
        f.write(full_text)
    print(f"[+] Saved transcription to: {out_txt_path.name}")

    # Generate Visual Debug Overlay
    vis_img = np.array(raw_img).copy()
    for idx, item in enumerate(line_metadata):
        cx1, cy1, cx2, cy2 = item["crop_coords"]
        cv2.rectangle(vis_img, (cx1, cy1), (cx2, cy2), (0, 200, 0), 2)
        cv2.putText(vis_img, str(idx + 1), (max(0, cx1 - 40), cy1 + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (220, 0, 0), 2)

    Image.fromarray(vis_img).save(out_vis_path)
    print(f"[+] Saved visual debug overlay to: {out_vis_path.name}")


def main():
    device = get_device()
    print(f"\nLoading models...")
    yolo_model = YOLO(YOLO_MODEL_PATH)
    processor = TrOCRProcessor.from_pretrained(TROCR_MODEL_DIR)
    trocr_model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL_DIR).to(device)
    trocr_model.eval()
    print("Models ready!")

    for img_path in TEST_IMAGES:
        if os.path.exists(img_path):
            process_image(img_path, yolo_model, processor, trocr_model, device)
        else:
            print(f"[!] Warning: {img_path} not found.")


if __name__ == "__main__":
    main()
