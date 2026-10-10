"""Repair split YOLO lines only when handwriting crosses their shared boundary."""
import cv2
import numpy as np
from PIL import Image
from statistics import median


def reading_order(boxes):
    """Group near-aligned fragments into rows, then read each row left to right."""
    rows = []
    for box in sorted(boxes, key=lambda b: (b['centroid_y'], b['x1'])):
        height = box['y2'] - box['y1']
        if rows and abs(box['centroid_y'] - rows[-1][0]['centroid_y']) <= 0.35 * min(height, rows[-1][0]['y2'] - rows[-1][0]['y1']):
            rows[-1].append(box)
        else:
            rows.append([box])
    return [box for row in rows for box in sorted(row, key=lambda b: b['x1'])]


def join_recognized_lines(lines):
    """Preserve words/case/punctuation; infer only whitespace from line geometry."""
    if not lines:
        return ''
    heights = [line['bbox'][3] - line['bbox'][1] for line in lines]
    typical_height = median(heights)
    gaps = [lines[i]['bbox'][1] - lines[i-1]['bbox'][3] for i in range(1, len(lines))
            if lines[i]['bbox'][1] > lines[i-1]['bbox'][3]]
    typical_gap = median(gaps) if gaps else typical_height * 0.5
    output = lines[0]['text'].strip()
    for previous, current in zip(lines, lines[1:]):
        a, b = previous['bbox'], current['bbox']
        same_row = abs((a[1]+a[3])/2 - (b[1]+b[3])/2) <= 0.35 * min(a[3]-a[1], b[3]-b[1])
        gap = b[1] - a[3]
        separator = ' ' if same_row else '\n\n' if gap > max(typical_gap * 1.6, typical_height) else '\n'
        output += separator + current['text'].strip()
    return output


def choose_transcript(original, enhanced, original_score, enhanced_score):
    """Do not reward a shorter candidate for omitting difficult words."""
    original_length, enhanced_length = len(original.strip()), len(enhanced.strip())
    if original_length < 0.8 * enhanced_length:
        return 1
    if enhanced_length < 0.8 * original_length:
        return 0
    return 0 if original_score >= enhanced_score else 1


def suppress_duplicate_boxes(boxes):
    """Suppress overlapping detections in both axes, retaining distinct regions."""
    kept = []
    for candidate in sorted(boxes, key=lambda b: b['conf'], reverse=True):
        if candidate['x2'] <= candidate['x1'] or candidate['y2'] <= candidate['y1']:
            continue
        duplicate = False
        for other in kept:
            overlap_x = max(0, min(candidate['x2'], other['x2']) - max(candidate['x1'], other['x1']))
            overlap_y = max(0, min(candidate['y2'], other['y2']) - max(candidate['y1'], other['y1']))
            width = min(candidate['x2'] - candidate['x1'], other['x2'] - other['x1'])
            height = min(candidate['y2'] - candidate['y1'], other['y2'] - other['y1'])
            if overlap_x / width > 0.65 and overlap_y / height > 0.65:
                duplicate = True
                break
        if not duplicate:
            kept.append(dict(candidate))
    return reading_order(kept)


def join_split_lines(image, boxes):
    gray = cv2.cvtColor(np.asarray(image.convert('RGB')), cv2.COLOR_RGB2GRAY)
    output = []
    for box in boxes:
        box = dict(box)
        if not output:
            output.append(box)
            continue
        prev = output[-1]
        height = min(prev['height'], box['height'])
        overlap = min(prev['x2'], box['x2']) - max(prev['x1'], box['x1'])
        width = min(prev['x2'] - prev['x1'], box['x2'] - box['x1'])
        gap = box['y1'] - prev['y2']
        if height <= 0 or width <= 0 or not (-0.3 * height <= gap <= 0.1 * height) or overlap < 0.7 * width:
            output.append(box)
            continue
        left, right = max(0, min(prev['x1'], box['x1'])), min(gray.shape[1], max(prev['x2'], box['x2']))
        top, bottom = max(0, prev['y1']), min(gray.shape[0], box['y2'])
        roi = gray[top:bottom, left:right]
        ink = cv2.adaptiveThreshold(roi, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY_INV, 25, 15)
        rules = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
            cv2.getStructuringElement(cv2.MORPH_RECT, (max(80, roi.shape[1] // 5), 1)))
        ink = cv2.subtract(ink, rules)
        _, _, stats, _ = cv2.connectedComponentsWithStats(ink)
        seam = (prev['y2'] + box['y1']) / 2 - top
        margin = max(3, height * 0.18)
        crossing = sum(1 for x, y, w, h, area in stats[1:]
            if y < seam - margin and y + h > seam + margin
            and area >= max(12, height * 0.3) and w < roi.shape[1] * 0.5
            and h < 2.5 * max(prev['height'], box['height']))
        if crossing < 2:
            output.append(box)
            continue
        prev.update(x1=left, x2=right, y1=top, y2=bottom,
                    height=bottom-top, centroid_y=(top+bottom)/2,
                    conf=min(prev['conf'], box['conf']))
    return output


def prepare_line_boxes(image, boxes, repair_split_lines=False):
    """Retain individual YOLO lines unless experimental repair is requested."""
    filtered = suppress_duplicate_boxes(boxes)
    return join_split_lines(image, filtered) if repair_split_lines else filtered


def deskew_and_clean_image(raw_img: Image.Image) -> Image.Image:
    """
    Detects paper tilt and automatically deskews the photo up to +/- 45 degrees.
    Expands the canvas to preserve writing near page edges.
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
                print(f"[ocr] auto-deskew rotating by {median_angle:.2f} deg", flush=True)
                return raw_img.rotate(median_angle, resample=Image.BILINEAR, expand=True, fillcolor="white")
    except Exception as exc:
        print(f"[ocr] deskew notice: {exc}", flush=True)

    return raw_img


