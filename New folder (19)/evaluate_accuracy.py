"""
================================================================================
THESIS ACCURACY & PERFORMANCE EVALUATOR
Evaluates CER, WER, Character Accuracy, Word Accuracy, and Document Similarity
for Handwritten OCR and Line Detection
================================================================================
"""

import re
import math
from pathlib import Path
from collections import Counter

BASE_DIR = Path(__file__).resolve().parent


def levenshtein_distance(ref_tokens, hyp_tokens):
    """
    Standard dynamic programming Levenshtein distance.
    Works for both lists of characters and lists of words.
    """
    r_len = len(ref_tokens)
    h_len = len(hyp_tokens)

    # Initialize matrix
    dp = [[0] * (h_len + 1) for _ in range(r_len + 1)]

    for i in range(r_len + 1):
        dp[i][0] = i
    for j in range(h_len + 1):
        dp[0][j] = j

    for i in range(1, r_len + 1):
        for j in range(1, h_len + 1):
            cost = 0 if ref_tokens[i - 1] == hyp_tokens[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,      # Deletion
                dp[i][j - 1] + 1,      # Insertion
                dp[i - 1][j - 1] + cost # Substitution
            )

    return dp[r_len][h_len]


def calculate_cer(reference_text, hypothesis_text, normalize=False):
    """Calculate Character Error Rate (CER)."""
    if normalize:
        reference_text = re.sub(r'\s+', ' ', reference_text.lower()).strip()
        hypothesis_text = re.sub(r'\s+', ' ', hypothesis_text.lower()).strip()

    ref_chars = list(reference_text)
    hyp_chars = list(hypothesis_text)

    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0

    dist = levenshtein_distance(ref_chars, hyp_chars)
    cer = dist / len(ref_chars)
    accuracy = max(0.0, (1.0 - cer)) * 100.0
    return cer, accuracy, dist, len(ref_chars)


def calculate_wer(reference_text, hypothesis_text, normalize=False):
    """Calculate Word Error Rate (WER)."""
    if normalize:
        # Strip punctuation and lowercase
        ref_words = re.findall(r'\b\w+\b', reference_text.lower())
        hyp_words = re.findall(r'\b\w+\b', hypothesis_text.lower())
    else:
        ref_words = reference_text.split()
        hyp_words = hypothesis_text.split()

    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    dist = levenshtein_distance(ref_words, hyp_words)
    wer = dist / len(ref_words)
    accuracy = max(0.0, (1.0 - wer)) * 100.0
    return wer, accuracy, dist, len(ref_words)


def calculate_jaccard_similarity(reference_text, hypothesis_text):
    """Token set Jaccard similarity (useful for Plagiarism/Similarity)."""
    ref_tokens = set(re.findall(r'\b\w+\b', reference_text.lower()))
    hyp_tokens = set(re.findall(r'\b\w+\b', hypothesis_text.lower()))

    if not ref_tokens and not hyp_tokens:
        return 100.0
    if not ref_tokens or not hyp_tokens:
        return 0.0

    intersection = len(ref_tokens & hyp_tokens)
    union = len(ref_tokens | hyp_tokens)
    return (intersection / union) * 100.0


def calculate_cosine_similarity(reference_text, hypothesis_text):
    """Bag-of-Words Cosine Similarity (matches thesis plagiarism metric)."""
    ref_tokens = re.findall(r'\b\w+\b', reference_text.lower())
    hyp_tokens = re.findall(r'\b\w+\b', hypothesis_text.lower())

    vec1 = Counter(ref_tokens)
    vec2 = Counter(hyp_tokens)

    intersection = set(vec1.keys()) & set(vec2.keys())
    numerator = sum([vec1[x] * vec2[x] for x in intersection])

    sum1 = sum([val ** 2 for val in vec1.values()])
    sum2 = sum([val ** 2 for val in vec2.values()])
    denominator = math.sqrt(sum1) * math.sqrt(sum2)

    if not denominator:
        return 0.0
    return float(numerator) / denominator * 100.0


def deduplicate_lines(text):
    """
    Cleans duplicated adjacent lines caused by overlapping YOLO boxes.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    deduped = []
    for line in lines:
        if not deduped:
            deduped.append(line)
            continue
        # Compare with previous line similarity
        prev = deduped[-1]
        cer_val, _, _, _ = calculate_cer(prev, line, normalize=True)
        # If > 70% character overlap between adjacent detections, it's a duplicate box
        if cer_val < 0.35:
            # Keep the longer/more complete string
            if len(line) > len(prev):
                deduped[-1] = line
        else:
            deduped.append(line)
    return "\n".join(deduped)


def evaluate_document(name, gt_path, pred_path):
    if not gt_path.exists() or not pred_path.exists():
        print(f"[!] Missing file for {name}: {gt_path} or {pred_path}")
        return None

    gt_text = gt_path.read_text(encoding="utf-8").strip()
    pred_text = pred_path.read_text(encoding="utf-8").strip()
    dedup_pred_text = deduplicate_lines(pred_text)

    # 1. Raw Metrics (Exact match including casing and punctuation)
    cer_raw, acc_char_raw, c_dist_raw, c_total = calculate_cer(gt_text, pred_text, normalize=False)
    wer_raw, acc_word_raw, w_dist_raw, w_total = calculate_wer(gt_text, pred_text, normalize=False)

    # 2. Normalized Metrics (Case-insensitive, standardized spacing)
    cer_norm, acc_char_norm, _, _ = calculate_cer(gt_text, pred_text, normalize=True)
    wer_norm, acc_word_norm, _, _ = calculate_wer(gt_text, pred_text, normalize=True)

    # 3. Deduplicated Metrics (Removes YOLO double-detected lines)
    cer_dedup, acc_char_dedup, _, _ = calculate_cer(gt_text, dedup_pred_text, normalize=True)
    wer_dedup, acc_word_dedup, _, _ = calculate_wer(gt_text, dedup_pred_text, normalize=True)

    # 4. Plagiarism/Similarity Metrics
    jaccard = calculate_jaccard_similarity(gt_text, dedup_pred_text)
    cosine = calculate_cosine_similarity(gt_text, dedup_pred_text)

    return {
        "name": name,
        "total_chars": c_total,
        "total_words": w_total,
        "cer_raw": cer_raw,
        "acc_char_raw": acc_char_raw,
        "wer_raw": wer_raw,
        "acc_word_raw": acc_word_raw,
        "cer_norm": cer_norm,
        "acc_char_norm": acc_char_norm,
        "wer_norm": wer_norm,
        "acc_word_norm": acc_word_norm,
        "cer_dedup": cer_dedup,
        "acc_char_dedup": acc_char_dedup,
        "wer_dedup": wer_dedup,
        "acc_word_dedup": acc_word_dedup,
        "jaccard": jaccard,
        "cosine": cosine,
        "raw_lines": len([l for l in pred_text.splitlines() if l.strip()]),
        "dedup_lines": len([l for l in dedup_pred_text.splitlines() if l.strip()])
    }


def main():
    docs = [
        ("1.jpg", BASE_DIR / "1_ground_truth.txt", BASE_DIR / "1_transcription.txt"),
        ("2.jpg", BASE_DIR / "2_ground_truth.txt", BASE_DIR / "2_transcription.txt"),
    ]

    results = []
    print("=" * 75)
    print("         HANDWRITTEN OCR PIPELINE ACCURACY & EVALUATION REPORT       ")
    print("=" * 75)

    for name, gt_path, pred_path in docs:
        res = evaluate_document(name, gt_path, pred_path)
        if res:
            results.append(res)
            print(f"\nDOCUMENT: {res['name']}")
            print(f"  Total Ground Truth: {res['total_words']} words, {res['total_chars']} characters")
            print(f"  Detected Lines: {res['raw_lines']} (Cleaned: {res['dedup_lines']})")
            print("-" * 55)
            print(f"  [Raw OCR Performance]")
            print(f"    - Character Error Rate (CER): {res['cer_raw']*100:.2f}%  -->  Char Accuracy: {res['acc_char_raw']:.2f}%")
            print(f"    - Word Error Rate (WER):      {res['wer_raw']*100:.2f}%  -->  Word Accuracy: {res['acc_word_raw']:.2f}%")
            print(f"  [Normalized Performance (Case/Punctuation Invariant)]")
            print(f"    - Normalized CER:             {res['cer_norm']*100:.2f}%  -->  Accuracy: {res['acc_char_norm']:.2f}%")
            print(f"    - Normalized WER:             {res['wer_norm']*100:.2f}%  -->  Accuracy: {res['acc_word_norm']:.2f}%")
            print(f"  [Post-Processed (IoU/Box Deduplication)]")
            print(f"    - Deduplicated CER:           {res['cer_dedup']*100:.2f}%  -->  Accuracy: {res['acc_char_dedup']:.2f}%")
            print(f"    - Deduplicated WER:           {res['wer_dedup']*100:.2f}%  -->  Accuracy: {res['acc_word_dedup']:.2f}%")
            print(f"  [Plagiarism / Thesis Similarity Metrics]")
            print(f"    - Vocabulary Jaccard Index:   {res['jaccard']:.2f}%")
            print(f"    - Cosine Semantic Similarity: {res['cosine']:.2f}%")

    if results:
        avg_char_acc = sum([r['acc_char_dedup'] for r in results]) / len(results)
        avg_word_acc = sum([r['acc_word_dedup'] for r in results]) / len(results)
        avg_cosine = sum([r['cosine'] for r in results]) / len(results)

        print("\n" + "=" * 75)
        print("                         SUMMARY BENCHMARK                           ")
        print("=" * 75)
        print(f"  Average Character Accuracy (Deduplicated): {avg_char_acc:.2f}%")
        print(f"  Average Word Accuracy (Deduplicated):      {avg_word_acc:.2f}%")
        print(f"  Average Cosine Semantic Similarity:        {avg_cosine:.2f}%")
        print("=" * 75)


if __name__ == "__main__":
    main()
