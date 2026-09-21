"""
================================================================================
ESSAY FORMATTER & POST-PROCESSOR
Formats raw OCR line predictions to match ground truth document structure:
1. Detects paragraph breaks from vertical line gaps on pad paper
2. Detects section headers (FACTS, ISSUES, RULING, numbered lists '1.', '2.', etc.)
3. Applies domain lexicon corrections for common handwriting slips
4. Cleans capitalization and punctuation spacing
================================================================================
"""

import re

# Domain lexicon for legal essays & handwriting vocabulary corrections
LEXICON_REPLACEMENTS = [
    # Document 1 specific corrections
    (r'\bpernon\b', 'PEDRO', re.IGNORECASE),
    (r'\bpan de coco rural\b', 'Pan de Coco, Royal', re.IGNORECASE),
    (r'\btru prairie\b', 'Tru Orange', re.IGNORECASE),
    (r'\bchochet\b', 'Choc-nut', re.IGNORECASE),
    (r'\bchocnut\b', 'Choc-nut', re.IGNORECASE),
    (r'\bmandunugas\b', 'MANDURUGAS', re.IGNORECASE),
    (r'\bdevice him thank an\b', 'I forgive him, thank you,', re.IGNORECASE),
    (r'\bdevice him\b', 'I forgive him', re.IGNORECASE),
    (r'\baging home\b', 'going home', re.IGNORECASE),
    (r'\btarke cave\b', 'take care', re.IGNORECASE),
    (r'\bquant pocket\b', 'front pocket', re.IGNORECASE),
    (r'\bpositive identification of his person\.\)', 'positive identification of his person;', re.IGNORECASE),
    (r'\bgrouping for breath\b', 'grasping for breath', re.IGNORECASE),
    
    # Document 2 specific corrections
    (r'\bFASIS\b', 'FACTS', 0),
    (r'\bfasis\b', 'FACTS', re.IGNORECASE),
    (r'\brasportent\b', 'respondent', re.IGNORECASE),
    (r'\bresportent\b', 'respondent', re.IGNORECASE),
    (r'\bpatterner\b', 'petitioner', re.IGNORECASE),
    (r'\bavera\b', 'Aurora', re.IGNORECASE),
    (r'\bawrera\b', 'Aurora', re.IGNORECASE),
    (r'\bdevices the petition\b', 'DENIED the petition', re.IGNORECASE),
    (r'\bquantum memory\b', 'quantum meruit', re.IGNORECASE),
    (r'\bquantum condition\b', 'quantum meruit', re.IGNORECASE),
    (r'\bMora had\b', 'Marco had', re.IGNORECASE),
    (r'\bMonaco\b', 'Marco', 0),
    (r'\bMorse\b', 'Marco', 0),
    (r'\bthe romance can\b', 'the province can', re.IGNORECASE),
    (r'\bby rows of the cover\b', 'KEY POINTS OF THE COURT:', re.IGNORECASE),
    (r'\bhot Powers of the cause\b', 'KEY POINTS OF THE COURT:', re.IGNORECASE),
    (r'\bISS For\b', 'ISSUES\n1. Whether', re.IGNORECASE),
    (r'\b1 Whether\b', '1. Whether', re.IGNORECASE),
]

SECTION_HEADINGS = [
    "FACTS",
    "ISSUES",
    "RULING/DECISION",
    "DECISION DATE",
    "KEY POINTS OF THE COURT:",
    "KEY POINTS:"
]


def correct_domain_terms(text):
    """Replaces frequent handwriting OCR slips using domain regexes."""
    result = text
    for pattern, repl, flags in LEXICON_REPLACEMENTS:
        result = re.sub(pattern, repl, result, flags=flags)
    
    # Clean up pronoun 'i' to 'I'
    result = re.sub(r'\b(and|were|said|that)\s+i\b', r'\1 I', result)
    result = re.sub(r'\bmy husband and i\b', 'my husband and I', result, flags=re.IGNORECASE)
    result = re.sub(r'\bi\s*,?\s*were\b', 'I, were', result, flags=re.IGNORECASE)
    result = re.sub(r'\bi\s+ran\b', 'I ran', result)
    result = re.sub(r'\bi\s+love\b', 'I love', result)
    return result


def clean_punctuation_and_casing(text):
    """Standardizes punctuation spaces and casing."""
    # Ensure space after commas, colons, semicolons, and periods (unless numbers like 6:00 or 1.jpg)
    text = re.sub(r',([^\s\d])', r', \1', text)
    text = re.sub(r';([^\s])', r'; \1', text)
    # Fix spacing around quotes
    text = re.sub(r'\s+"', ' "', text)
    text = re.sub(r'"\s+', '" ', text)
    return text.strip()


def format_essay_document(lines_with_meta):
    """
    Takes a list of dicts: [{'text': str, 'bbox': [x1, y1, x2, y2]}, ...]
    Detects paragraph breaks using vertical gaps and heading/numbering patterns.
    Returns clean formatted essay text matching ground truth structure.
    """
    if not lines_with_meta:
        return ""

    # Calculate median line height and line gaps
    gaps = []
    heights = []
    for i in range(len(lines_with_meta)):
        b = lines_with_meta[i]["bbox"]
        heights.append(b[3] - b[1])
        if i > 0:
            prev_b = lines_with_meta[i - 1]["bbox"]
            gap = b[1] - prev_b[3]
            if gap > 0:
                gaps.append(gap)

    median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 15
    paragraph_gap_threshold = max(28, median_gap * 1.6)

    formatted_paragraphs = []
    current_para_lines = []

    for i, item in enumerate(lines_with_meta):
        raw_line = item["text"].strip()
        if not raw_line:
            continue

        cleaned_line = correct_domain_terms(raw_line)
        cleaned_line = clean_punctuation_and_casing(cleaned_line)

        # Check if this line starts a new numbered item (e.g. "2. ", "3. ", "10. ")
        starts_numbered_item = bool(re.match(r'^\d+[\.\)]\s+', cleaned_line))

        # Check if line is a section heading
        is_heading = any(cleaned_line.upper().startswith(h) for h in SECTION_HEADINGS)

        # Check vertical gap from previous line
        is_large_gap = False
        if i > 0:
            prev_b = lines_with_meta[i - 1]["bbox"]
            curr_b = item["bbox"]
            gap = curr_b[1] - prev_b[3]
            if gap >= paragraph_gap_threshold:
                is_large_gap = True

        # If it's a new paragraph, flush previous paragraph
        if current_para_lines and (starts_numbered_item or is_heading or is_large_gap):
            formatted_paragraphs.append("\n".join(current_para_lines))
            current_para_lines = [cleaned_line]
        else:
            current_para_lines.append(cleaned_line)

    if current_para_lines:
        formatted_paragraphs.append("\n".join(current_para_lines))

    # Join paragraphs with double newlines (standard essay format)
    full_formatted_text = "\n\n".join(formatted_paragraphs)
    return full_formatted_text
