import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

DB_PATH = Path(__file__).resolve().parent / "plagiarism.db"

# Optional Supabase table schema for users who want cloud sync
SUPABASE_MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS "plagiarismScans" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    scan_id TEXT NOT NULL UNIQUE,
    filename TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total_words INTEGER DEFAULT 0,
    plagiarism_score NUMERIC DEFAULT 0,
    identical_words INTEGER DEFAULT 0,
    result_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);
"""


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the local SQLite database table if not already created."""
    with _get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS plagiarism_scans (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                scan_id TEXT NOT NULL UNIQUE,
                filename TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                total_words INTEGER DEFAULT 0,
                plagiarism_score REAL DEFAULT 0.0,
                identical_words INTEGER DEFAULT 0,
                result_data TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_scan_id ON plagiarism_scans(scan_id);
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_id ON plagiarism_scans(user_id);
        """)
        # Auto-migrate plagiarism_scans if missing submitted_text
        scan_cursor = conn.execute("PRAGMA table_info(plagiarism_scans)")
        scan_cols = [row[1] for row in scan_cursor.fetchall()]
        if "submitted_text" not in scan_cols:
            conn.execute("ALTER TABLE plagiarism_scans ADD COLUMN submitted_text TEXT")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS submission_grades (
                submission_id TEXT PRIMARY KEY,
                grade TEXT,
                feedback TEXT,
                status TEXT DEFAULT 'graded',
                transcribed_text TEXT,
                scan_result TEXT,
                updated_at TEXT NOT NULL
            )
        """)
        # Auto-migrate existing table if missing new columns
        cursor = conn.execute("PRAGMA table_info(submission_grades)")
        col_names = [row[1] for row in cursor.fetchall()]
        if "transcribed_text" not in col_names:
            conn.execute("ALTER TABLE submission_grades ADD COLUMN transcribed_text TEXT")
        if "scan_result" not in col_names:
            conn.execute("ALTER TABLE submission_grades ADD COLUMN scan_result TEXT")
        conn.commit()


def save_submission_grade(
    submission_id: str,
    grade: str,
    feedback: str = "",
    status: str = "graded",
    transcribed_text: Optional[str] = None,
    scan_result: Optional[Union[Dict[str, Any], str]] = None,
) -> Dict[str, Any]:
    init_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    scan_result_str = (
        json.dumps(scan_result)
        if isinstance(scan_result, dict)
        else scan_result
    )
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO submission_grades (
                submission_id, grade, feedback, status, transcribed_text, scan_result, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(submission_id) DO UPDATE SET
                grade = excluded.grade,
                feedback = excluded.feedback,
                status = excluded.status,
                transcribed_text = COALESCE(excluded.transcribed_text, submission_grades.transcribed_text),
                scan_result = COALESCE(excluded.scan_result, submission_grades.scan_result),
                updated_at = excluded.updated_at
            """,
            (submission_id, str(grade), str(feedback), status, transcribed_text, scan_result_str, now_iso),
        )
        conn.commit()
    return {
        "submission_id": submission_id,
        "grade": grade,
        "feedback": feedback,
        "status": status,
        "transcribed_text": transcribed_text,
        "scan_result": scan_result,
        "updated_at": now_iso,
    }


def save_submission_scan(
    submission_id: str,
    transcribed_text: str = "",
    scan_result: Optional[Union[Dict[str, Any], str]] = None,
) -> Dict[str, Any]:
    init_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    scan_result_str = (
        json.dumps(scan_result)
        if isinstance(scan_result, dict)
        else scan_result
    )
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO submission_grades (
                submission_id, grade, feedback, status, transcribed_text, scan_result, updated_at
            ) VALUES (?, '', '', 'submitted', ?, ?, ?)
            ON CONFLICT(submission_id) DO UPDATE SET
                transcribed_text = COALESCE(excluded.transcribed_text, submission_grades.transcribed_text),
                scan_result = COALESCE(excluded.scan_result, submission_grades.scan_result),
                updated_at = excluded.updated_at
            """,
            (submission_id, transcribed_text, scan_result_str, now_iso),
        )
        conn.commit()
    return {
        "submission_id": submission_id,
        "transcribed_text": transcribed_text,
        "scan_result": scan_result,
        "updated_at": now_iso,
    }


def get_submission_grades() -> Dict[str, Dict[str, Any]]:
    init_db()
    with _get_connection() as conn:
        cursor = conn.execute("SELECT * FROM submission_grades")
        rows = cursor.fetchall()
        result = {}
        for r in rows:
            d = dict(r)
            if d.get("scan_result"):
                try:
                    d["scan_result"] = json.loads(d["scan_result"])
                except Exception:
                    pass

                scan_res = d.get("scan_result")
                if isinstance(scan_res, dict):
                    matched = scan_res.get("matchedSources") or scan_res.get("matched_sources") or []
                    if "result_data" in scan_res and isinstance(scan_res["result_data"], dict):
                        sub_matched = scan_res["result_data"].get("matched_sources") or []
                        if sub_matched:
                            matched = sub_matched

                    has_dummy = any(
                        "wikipedia" in str(s.get("url", "")).lower()
                        or "wikipedia" in str(s.get("title", "")).lower()
                        or "Academic_integrity" in str(s.get("url", ""))
                        or "Online Reference" in str(s.get("title", ""))
                        or str(s.get("url", "")) == "https://copyleaks.com/plagiarism-checker"
                        for s in matched
                    )
                    needs_enrichment = not matched or has_dummy or "highlighted_sentences" not in scan_res
                    if needs_enrichment:
                        text = d.get("transcribed_text") or ""
                        if text:
                            try:
                                from source_finder import find_copyleaks_sources, extract_plagiarism_highlights
                                real_sources = find_copyleaks_sources(text) if (not matched or has_dummy) else matched
                                if real_sources:
                                    scan_res["matchedSources"] = real_sources
                                    scan_res["matched_sources"] = real_sources
                                    if "result_data" in scan_res and isinstance(scan_res["result_data"], dict):
                                        scan_res["result_data"]["matched_sources"] = real_sources
                                    peer_snips = (scan_res.get("peerSimilarity") or {}).get("matching_snippets") or []
                                    highlights = extract_plagiarism_highlights(text, real_sources, peer_snips)
                                    scan_res["highlighted_sentences"] = highlights
                                    if "result_data" in scan_res and isinstance(scan_res["result_data"], dict):
                                        scan_res["result_data"]["highlighted_sentences"] = highlights
                                    d["scan_result"] = scan_res
                                    conn.execute(
                                        "UPDATE submission_grades SET scan_result = ? WHERE submission_id = ?",
                                        (json.dumps(scan_res, ensure_ascii=False), d["submission_id"]),
                                    )
                                    conn.commit()
                            except Exception as e:
                                print(f"[get_submission_grades] error enriching sources: {e}", flush=True)

            result[d["submission_id"]] = d
        return result



def create_scan(
    user_id: str,
    scan_id: str,
    filename: Optional[str] = None,
    status: str = "processing",
    submitted_text: Optional[str] = None,
) -> Dict[str, Any]:
    init_db()
    record_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO plagiarism_scans (
                id, user_id, scan_id, filename, status, submitted_text, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, user_id, scan_id, filename, status, submitted_text, now_iso),
        )
        conn.commit()
    return get_scan(scan_id) or {}


def get_scan(scan_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    with _get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM plagiarism_scans WHERE scan_id = ?",
            (scan_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return _format_row(row)


def update_scan_completed(
    scan_id: str,
    total_words: int,
    plagiarism_score: float,
    identical_words: int,
    result_data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    init_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    result_json = json.dumps(result_data, ensure_ascii=False)
    with _get_connection() as conn:
        conn.execute(
            """
            UPDATE plagiarism_scans
            SET status = 'completed',
                total_words = ?,
                plagiarism_score = ?,
                identical_words = ?,
                result_data = ?,
                completed_at = ?
            WHERE scan_id = ?
            """,
            (
                total_words,
                round(float(plagiarism_score), 2),
                identical_words,
                result_json,
                now_iso,
                scan_id,
            ),
        )
        conn.commit()
    return get_scan(scan_id)


def update_scan_failed(
    scan_id: str,
    error_message: str = "Scan failed",
) -> Optional[Dict[str, Any]]:
    init_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    result_json = json.dumps({"error": error_message}, ensure_ascii=False)
    with _get_connection() as conn:
        conn.execute(
            """
            UPDATE plagiarism_scans
            SET status = 'failed',
                result_data = ?,
                completed_at = ?
            WHERE scan_id = ?
            """,
            (result_json, now_iso, scan_id),
        )
        conn.commit()
    return get_scan(scan_id)


def list_user_scans(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    init_db()
    with _get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT * FROM plagiarism_scans
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = cursor.fetchall()
        return [_format_row(r) for r in rows]


def _format_row(row: sqlite3.Row) -> Dict[str, Any]:
    raw_dict = dict(row)
    try:
        raw_dict["result_data"] = json.loads(raw_dict.get("result_data") or "{}")
    except Exception:
        raw_dict["result_data"] = {}
    return raw_dict


def _tokenize_words(text: str) -> List[str]:
    """Extract clean alphanumeric words for linguistic comparison."""
    import re
    return re.findall(r"\b[a-zA-Z0-9']+\b", text.lower())


def _extract_ngrams(words: List[str], n: int = 3) -> set:
    """Extract word-level n-grams."""
    if len(words) < n:
        return set()
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def _find_matching_phrases(words_a: List[str], words_b: List[str], min_length: int = 4) -> List[str]:
    """Find common word sequences of at least min_length words."""
    matches = []
    set_b_strings = set()
    b_len = len(words_b)
    for i in range(b_len - min_length + 1):
        set_b_strings.add(" ".join(words_b[i : i + min_length]))

    i = 0
    while i <= len(words_a) - min_length:
        phrase = " ".join(words_a[i : i + min_length])
        if phrase in set_b_strings:
            # Expand phrase as far as possible
            k = min_length
            while i + k <= len(words_a):
                candidate = " ".join(words_a[i : i + k])
                found = False
                for j in range(b_len - k + 1):
                    if " ".join(words_b[j : j + k]) == candidate:
                        found = True
                        break
                if not found:
                    k -= 1
                    break
                k += 1
            full_match = " ".join(words_a[i : i + k])
            if full_match not in matches and len(full_match.split()) >= min_length:
                matches.append(full_match)
            i += max(1, k)
        else:
            i += 1
    return matches[:5]


def compute_peer_similarity(
    text: str,
    current_submission_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compares the given text against all previous student submissions stored
    in the database to detect cross-student copying (peer-to-peer plagiarism).
    """
    init_db()
    clean_text = (text or "").strip()
    words_input = _tokenize_words(clean_text)
    if len(words_input) < 10:
        return {
            "peer_similarity_score": 0.0,
            "has_peer_match": False,
            "highest_match_submission_id": None,
            "matched_submission_label": None,
            "matching_snippets": [],
            "all_matches": [],
            "total_peers_compared": 0,
        }

    trigrams_input = _extract_ngrams(words_input, n=3)
    quadgrams_input = _extract_ngrams(words_input, n=4)

    peer_records = []
    with _get_connection() as conn:
        cursor = conn.execute(
            "SELECT submission_id, grade, status, transcribed_text, updated_at FROM submission_grades"
        )
        for row in cursor.fetchall():
            d = dict(row)
            sub_id = str(d.get("submission_id") or "")
            if current_submission_id and sub_id == str(current_submission_id):
                continue
            t_text = (d.get("transcribed_text") or "").strip()
            if len(t_text) >= 15:
                peer_records.append({"submission_id": sub_id, "text": t_text})

    if not peer_records:
        return {
            "peer_similarity_score": 0.0,
            "has_peer_match": False,
            "highest_match_submission_id": None,
            "matched_submission_label": None,
            "matching_snippets": [],
            "all_matches": [],
            "total_peers_compared": 0,
        }

    scored_matches = []
    for peer in peer_records:
        words_peer = _tokenize_words(peer["text"])
        if len(words_peer) < 10:
            continue

        trigrams_peer = _extract_ngrams(words_peer, n=3)
        quadgrams_peer = _extract_ngrams(words_peer, n=4)

        # 3-gram Jaccard
        intersect_3 = len(trigrams_input.intersection(trigrams_peer))
        union_3 = len(trigrams_input.union(trigrams_peer)) or 1
        jaccard_3 = intersect_3 / union_3

        # 4-gram Overlap relative to shorter document
        intersect_4 = len(quadgrams_input.intersection(quadgrams_peer))
        min_4 = max(1, min(len(quadgrams_input), len(quadgrams_peer)))
        containment_4 = intersect_4 / min_4

        # Word frequency cosine similarity
        freq_a = {}
        for w in words_input:
            freq_a[w] = freq_a.get(w, 0) + 1
        freq_b = {}
        for w in words_peer:
            freq_b[w] = freq_b.get(w, 0) + 1

        all_words = set(freq_a.keys()).union(freq_b.keys())
        dot = sum(freq_a.get(w, 0) * freq_b.get(w, 0) for w in all_words)
        mag_a = sum(v ** 2 for v in freq_a.values()) ** 0.5
        mag_b = sum(v ** 2 for v in freq_b.values()) ** 0.5
        cosine = dot / (mag_a * mag_b) if (mag_a and mag_b) else 0.0

        # Blended Peer Score (emphasizing n-gram containment for exact phrase copying)
        blended = (containment_4 * 0.55) + (jaccard_3 * 0.25) + (cosine * 0.20)
        score_percent = round(min(100.0, max(0.0, blended * 100.0)), 1)

        snippets = []
        if score_percent >= 10.0:
            snippets = _find_matching_phrases(words_input, words_peer, min_length=4)

        scored_matches.append({
            "submission_id": peer["submission_id"],
            "score_percent": score_percent,
            "identical_phrases_count": len(snippets),
            "matching_snippets": snippets,
        })

    scored_matches.sort(key=lambda x: x["score_percent"], reverse=True)
    top_match = scored_matches[0] if scored_matches else None
    top_score = top_match["score_percent"] if top_match else 0.0

    return {
        "peer_similarity_score": top_score,
        "has_peer_match": top_score >= 15.0,
        "highest_match_submission_id": top_match["submission_id"] if top_match else None,
        "matched_submission_label": f"Submission #{top_match['submission_id'][:8]}" if top_match else None,
        "matching_snippets": top_match["matching_snippets"] if top_match else [],
        "all_matches": [m for m in scored_matches if m["score_percent"] >= 8.0][:5],
        "total_peers_compared": len(peer_records),
    }


# Auto-initialize table on module import
init_db()
