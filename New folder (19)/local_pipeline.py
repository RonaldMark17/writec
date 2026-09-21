"""
================================================================================
LOCAL TEST SCRIPT: YOLO Line Detection + Fine-Tuned TrOCR
Preconfigured with your local directory models and test images
================================================================================
"""

import os
from pathlib import Path
from colab_pipeline import run_pipeline

BASE_DIR = Path(__file__).resolve().parent

# Local paths to your models
YOLO_MODEL_PATH = str(BASE_DIR / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "weights" / "best.pt")
TROCR_MODEL_DIR = str(BASE_DIR / "final_model")

# Sample image from your test predictions
TEST_IMG_DIR = BASE_DIR / "yolo26x_grayscale_1024_lr0.00075_adam_scale_only_0.1_701515_FINAL_RESULTS" / "test_predictions"

# Pick first available test image or default
sample_images = list(TEST_IMG_DIR.glob("*.jpg"))
if sample_images:
    IMAGE_PATH = str(sample_images[0])
    print(f"[+] Found test image: {sample_images[0].name}")
else:
    IMAGE_PATH = str(BASE_DIR / "essay.jpg")

OUTPUT_TXT_PATH = str(BASE_DIR / "recognized_essay_output.txt")

if __name__ == "__main__":
    print("Starting Local OCR Pipeline Test...")
    run_pipeline(
        yolo_path=YOLO_MODEL_PATH,
        trocr_dir=TROCR_MODEL_DIR,
        image_path=IMAGE_PATH,
        output_txt=OUTPUT_TXT_PATH
    )
