"""
Supabase Synchronization Engine for WriteCheck
Automatically synchronizes all plagiarism scans, handwriting transcriptions,
and submission grades from plagiarism.db directly to Supabase in real-time.
"""

import json
import os
import threading
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Load Supabase configuration with defaults from src/supabaseClient.js
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
# Accept either service role secret (recommended for backend) or publishable key
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or "sb_publishable_wNxWHuOyc0riOo4VXmsbGQ_jxPZi03s"
)


def _send_supabase_request(
    endpoint: str,
    method: str = "POST",
    payload: Optional[Any] = None,
    prefer: Optional[str] = None,
    timeout: float = 4.0,
) -> Dict[str, Any]:
    """
    Sends an authenticated REST request to Supabase PostgREST API.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"success": False, "error": "Supabase credentials not configured."}

    url = f"{SUPABASE_URL}/rest/v1/{endpoint.lstrip('/')}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "accept-profile": "public",
    }
    if prefer:
        headers["Prefer"] = prefer

    data_bytes = None
    if payload is not None:
        data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            res_json = json.loads(body) if body.strip() else None
            return {"success": True, "status": resp.status, "data": res_json}
    except urllib.error.HTTPError as he:
        err_msg = he.read().decode("utf-8", errors="replace")
        return {"success": False, "status": he.code, "error": err_msg}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def sync_plagiarism_scan(scan_record: Dict[str, Any], async_mode: bool = True) -> None:
    """
    Saves or updates a plagiarism scan record into Supabase 'plagiarism_scans' table.
    """
    if not scan_record:
        return

    def _task():
        # Parse result_data if string
        res_data = scan_record.get("result_data")
        if isinstance(res_data, str):
            try:
                res_data = json.loads(res_data)
            except Exception:
                pass

        payload = {
            "id": scan_record.get("id"),
            "user_id": scan_record.get("user_id") or "anonymous",
            "scan_id": scan_record.get("scan_id"),
            "filename": scan_record.get("filename") or "essay.txt",
            "status": scan_record.get("status") or "completed",
            "total_words": int(scan_record.get("total_words") or 0),
            "plagiarism_score": float(scan_record.get("plagiarism_score") or 0.0),
            "identical_words": int(scan_record.get("identical_words") or 0),
            "result_data": res_data,
            "submitted_text": scan_record.get("submitted_text") or "",
            "created_at": scan_record.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "completed_at": scan_record.get("completed_at"),
        }

        # Clean None fields
        clean_payload = {k: v for k, v in payload.items() if v is not None}

        # 1. Upsert into 'plagiarism_scans' table
        resp = _send_supabase_request(
            endpoint="plagiarism_scans",
            method="POST",
            payload=clean_payload,
            prefer="resolution=merge-duplicates,return=representation",
        )

        if resp.get("success"):
            print(f"[supabase sync] synced scan {payload.get('scan_id')} to Supabase plagiarism_scans table.", flush=True)
        else:
            # If table doesn't exist yet, notify gently in logs without failing
            status = resp.get("status")
            err = resp.get("error", "")
            if status == 404 or "Could not find the table" in str(err) or "relation" in str(err):
                print(f"[supabase sync notice] 'plagiarism_scans' table not created in Supabase yet. Run supabase_schema.sql to enable table sync.", flush=True)
            else:
                print(f"[supabase sync] scan sync notice: {status} - {err}", flush=True)

    if async_mode:
        threading.Thread(target=_task, daemon=True).start()
    else:
        _task()


def sync_submission_grade(
    submission_id: str,
    grade: str = "",
    feedback: str = "",
    status: str = "graded",
    transcribed_text: str = "",
    scan_result: Any = None,
    updated_at: str = "",
    async_mode: bool = True,
) -> None:
    """
    Synchronizes submission grade, OCR transcription, and detection results to Supabase:
    1. Updates 'submissionTable' (grade, feedback, status, and OCR/score columns if available)
    2. Upserts into dedicated 'submission_grades' table
    """
    if not submission_id:
        return

    def _task():
        ts = updated_at or datetime.now(timezone.utc).isoformat()
        res_data = scan_result
        if isinstance(res_data, str):
            try:
                res_data = json.loads(res_data)
            except Exception:
                pass

        score = None
        if isinstance(res_data, dict):
            score = res_data.get("score") or res_data.get("plagiarism_score")

        # 1. Update submissionTable (primary Supabase submissions table)
        full_sub_payload: Dict[str, Any] = {
            "grade": grade,
            "feedback": feedback,
            "status": status,
        }
        if transcribed_text:
            full_sub_payload["transcribed_text"] = transcribed_text
        if res_data:
            full_sub_payload["scan_result"] = res_data
        if score is not None:
            full_sub_payload["plagiarism_score"] = float(score)

        patch_endpoint = f"submissionTable?id=eq.{urllib.parse.quote(submission_id)}"
        sub_resp = _send_supabase_request(
            endpoint=patch_endpoint,
            method="PATCH",
            payload=full_sub_payload,
        )

        if not sub_resp.get("success"):
            # If extra columns don't exist yet on submissionTable, retry with standard core columns
            basic_payload = {
                "grade": grade,
                "feedback": feedback,
                "status": status,
            }
            basic_resp = _send_supabase_request(
                endpoint=patch_endpoint,
                method="PATCH",
                payload=basic_payload,
            )
            if basic_resp.get("success"):
                print(f"[supabase sync] updated submissionTable for {submission_id} (grade, feedback, status).", flush=True)
            else:
                print(f"[supabase sync] submissionTable update note: {basic_resp.get('error')}", flush=True)
        else:
            print(f"[supabase sync] updated submissionTable for {submission_id} with full scan details.", flush=True)

        # 2. Upsert into dedicated submission_grades table
        grade_payload = {
            "submission_id": submission_id,
            "grade": grade,
            "feedback": feedback,
            "status": status,
            "transcribed_text": transcribed_text,
            "scan_result": res_data,
            "updated_at": ts,
        }

        sg_resp = _send_supabase_request(
            endpoint="submission_grades",
            method="POST",
            payload=grade_payload,
            prefer="resolution=merge-duplicates,return=representation",
        )

        if sg_resp.get("success"):
            print(f"[supabase sync] synced submission_grades table for {submission_id}.", flush=True)
        else:
            err = sg_resp.get("error", "")
            if "Could not find the table" in str(err) or sg_resp.get("status") == 404:
                print(f"[supabase sync notice] 'submission_grades' table not created in Supabase yet. Run supabase_schema.sql to enable table sync.", flush=True)
            else:
                print(f"[supabase sync] submission_grades note: {err}", flush=True)

    if async_mode:
        threading.Thread(target=_task, daemon=True).start()
    else:
        _task()


def sync_all_from_local_db() -> Dict[str, int]:
    """
    Scans local plagiarism.db and pushes any existing records to Supabase.
    """
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "plagiarism.db")
    if not os.path.exists(db_path):
        return {"scans_synced": 0, "grades_synced": 0}

    scans_count = 0
    grades_count = 0

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Sync scans
        cur.execute("SELECT * FROM plagiarism_scans")
        scans = cur.fetchall()
        for s in scans:
            sync_plagiarism_scan(dict(s), async_mode=False)
            scans_count += 1

        # Sync submission grades
        cur.execute("SELECT * FROM submission_grades")
        grades = cur.fetchall()
        for g in grades:
            row = dict(g)
            sync_submission_grade(
                submission_id=row.get("submission_id"),
                grade=row.get("grade") or "",
                feedback=row.get("feedback") or "",
                status=row.get("status") or "graded",
                transcribed_text=row.get("transcribed_text") or "",
                scan_result=row.get("scan_result"),
                updated_at=row.get("updated_at") or "",
                async_mode=False,
            )
            grades_count += 1

        conn.close()
    except Exception as exc:
        print(f"[supabase sync] error during bulk sync: {exc}", flush=True)

    return {"scans_synced": scans_count, "grades_synced": grades_count}
