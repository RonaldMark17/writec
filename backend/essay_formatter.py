"""Format OCR layout without replacing recognized words with sample-specific text."""
import re

SECTION_HEADINGS = [
    "FACTS",
    "ISSUES",
    "RULING/DECISION",
    "DECISION DATE",
    "KEY POINTS OF THE COURT:",
    "KEY POINTS:",
]


def correct_domain_terms(text):
    """Preserve recognized words; domain-specific substitutions invent content."""
    return text.strip()


def clean_punctuation_and_casing(text):
    """Normalize punctuation spacing without replacing recognized words."""
    # Fix time colon spacing like 12: 00 pm -> 12:00 pm
    text = re.sub(r'(\d{1,2}):\s*(\d{2})', r'\1:\2', text)
    # Fix slash spacing between words: "home/ why" -> "home / why"
    text = re.sub(r'([a-zA-Z0-9]),?\/([a-zA-Z0-9])', r'\1 / \2', text)
    text = re.sub(r'([a-zA-Z0-9])\/([a-zA-Z0-9])', r'\1 / \2', text)
    # Ensure space after commas, colons, semicolons, and periods (unless numbers like 6:00 or 1.jpg)
    text = re.sub(r',([^\s\d])', r', \1', text)
    text = re.sub(r';([^\s])', r'; \1', text)
    text = re.sub(r';\s*,', ';', text)
    text = re.sub(r';\s*;\s*', '; ', text)
    # Fix spacing around quotes
    text = re.sub(r'\s+"', ' "', text)
    text = re.sub(r'"\s+', '" ', text)
    # Remove extra spaces
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def format_essay_document(lines_with_meta):
    """
    Takes a list of dicts: [{'text': str, 'bbox': [x1, y1, x2, y2]}, ...]
    Detects paragraph breaks using vertical gaps and heading/numbering patterns.
    Preserve recognized text while reconstructing paragraph spacing.
    """
    if not lines_with_meta:
        return ""

    # Calculate average line height to dynamically scale paragraph gap threshold for high-res mobile photos
    line_heights = [item["bbox"][3] - item["bbox"][1] for item in lines_with_meta if item.get("bbox")]
    avg_line_height = sum(line_heights) / max(1, len(line_heights)) if line_heights else 30
    # True paragraph breaks on notebook/pad paper are significantly taller than normal line-to-line leading
    paragraph_gap_threshold = max(24, avg_line_height * 0.85)

    formatted_paragraphs = []
    current_para_lines = []

    for i, item in enumerate(lines_with_meta):
        raw_line = item["text"].strip()
        if not raw_line:
            continue

        cleaned_block = correct_domain_terms(raw_line)
        cleaned_block = clean_punctuation_and_casing(cleaned_block)
        cleaned_block = re.sub(r'(?m)^(\d+[\.\)]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), cleaned_block)

        # Preserve any line breaks already supplied by the recognizer.
        sublines = [s.strip() for s in cleaned_block.splitlines() if s.strip()]

        for sub_idx, subline in enumerate(sublines):
            # Check if this line starts a new numbered item (e.g. "2. ", "3. ", "10. ")
            starts_numbered_item = bool(re.match(r'^\d+[\.\)]\s+', subline))

            # Check if line is a section heading
            is_heading = any(subline.upper() == h or subline.upper().startswith(h) for h in SECTION_HEADINGS)

            # Check vertical gap from previous detection (only for the first subline of the box)
            is_large_gap = False
            if sub_idx == 0 and i > 0:
                prev_b = lines_with_meta[i - 1]["bbox"]
                curr_b = item["bbox"]
                gap = curr_b[1] - prev_b[3]
                if gap >= paragraph_gap_threshold:
                    is_large_gap = True

            # Under headings (like FACTS, ISSUES, RULING), the first line directly follows with \n
            curr_is_alone_heading = (
                len(current_para_lines) == 1 and any(current_para_lines[0].upper().startswith(h) for h in SECTION_HEADINGS)
            )

            # Sub-items under ISSUES (like 2. Whether) stay in the same ISSUES section
            in_issues_block = any("ISSUES" in l.upper() for l in current_para_lines) and starts_numbered_item

            if current_para_lines and not curr_is_alone_heading and not in_issues_block and (starts_numbered_item or is_heading or is_large_gap):
                formatted_paragraphs.append("\n".join(current_para_lines))
                current_para_lines = [subline]
            else:
                current_para_lines.append(subline)

    if current_para_lines:
        formatted_paragraphs.append("\n".join(current_para_lines))

    # Join paragraphs with double newlines (standard essay ground-truth format)
    full_formatted_text = "\n\n".join(formatted_paragraphs)

    return full_formatted_text
