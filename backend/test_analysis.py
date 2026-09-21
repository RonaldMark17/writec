import requests
import json
from PIL import Image

def analyze():
    img_path = 'test_internet_sample.jpg'
    img = Image.open(img_path)
    w, h = img.size
    print(f"Image Dimensions: {w}x{h}")
    
    with open(img_path, 'rb') as f:
        res = requests.post('http://localhost:8000/upload', files={'file': ('test.jpg', f, 'image/jpeg')})
    
    data = res.json()
    print("API Response Summary:")
    print(f"Detected lines: {data.get('detected_line_count')}")
    print(f"Duplicate lines: {data.get('duplicate_line_count')}")
    print(f"Processed lines: {data.get('processed_line_count')}")
    print("Boxes:")
    for i, (line, box, conf) in enumerate(zip(data['lines'], data['boxes'], data['confidences']), 1):
        bw = box['x2'] - box['x1']
        bh = box['y2'] - box['y1']
        print(f"  Line {i}: '{line}' [Conf: {conf:.2f}] [Box: {box}, Size: {bw}x{bh}]")

    print("\nFormatted Text Output:")
    print(data.get('text'))

if __name__ == '__main__':
    analyze()
