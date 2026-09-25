"""
Supabase Synchronization Engine for WriteCheck
Synchronizes standalone plagiarism scan history from plagiarism.db.
Submission results are saved directly through submission_persistence instead.
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
    if SUPABASE_KEY.startswith('sb_secret_'):
        headers.pop('Authorization')
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


def sync_all_from_local_db() -> Dict[str, int]:
    """
    Syncs standalone scan history only; never replays historical submission grades.
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

        # Historical grades remain local; submissionTable is authoritative.

        conn.close()
    except Exception as exc:
        print(f"[supabase sync] error during bulk sync: {exc}", flush=True)

    return {"scans_synced": scans_count, "grades_synced": grades_count}
