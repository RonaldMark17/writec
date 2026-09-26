"""Admin API using the caller's verified Supabase session, never a frontend role."""
import json
import os
import urllib.error
import urllib.request
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def supabase_headers(token):
    # Opaque server keys belong in apikey, not the user JWT header.
    if token and token.startswith('sb_secret_') and token == os.getenv('SUPABASE_SERVICE_ROLE_KEY'):
        return {"apikey": token}
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY") or "sb_publishable_wNxWHuOyc0riOo4VXmsbGQ_jxPZi03s"
    return {"apikey": key, "Authorization": "Bearer " + token}


def supabase_request(path, token, payload=None, method=None):
    url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
    request = urllib.request.Request(
        url + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={**supabase_headers(token), "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        method=method or ("POST" if payload is not None else "GET"),
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        status = exc.code if exc.code in (401, 403, 404, 409, 429) else 502
        # Never return raw upstream payloads or credentials to the browser.
        raise HTTPException(status, {401: "Session expired. Sign in again.", 403: "Access denied.",
            404: "Record or required database function not found.", 429: "Too many requests. Try again shortly."}.get(status,
            "Database request failed. Check the admin migration and server configuration.")) from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(503, "Authentication/database service unavailable.") from None


def authenticated_account(request: Request):
    cached = getattr(request.state, "account", None)
    if cached is not None:
        return cached
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Sign in to continue.")
    token = token.strip()
    user = supabase_request("/auth/v1/user", token)
    account = None
    try:
        account = supabase_request("/rest/v1/rpc/current_account", token, {})
    except Exception:
        pass
    if not account or account.get("id") != user.get("id"):
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if service_key and user.get("id"):
            url = os.getenv("SUPABASE_URL", "https://qtqvnutcalmmqmmbwueu.supabase.co").rstrip("/")
            req_u = urllib.request.Request(
                f"{url}/rest/v1/userTable?id=eq.{user.get('id')}&select=id,full_name,email,role,account_status,registered_at",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"}
            )
            try:
                with urllib.request.urlopen(req_u, timeout=5) as u_resp:
                    rows = json.load(u_resp)
                    if rows:
                        account = rows[0]
            except Exception:
                pass
    if not account or account.get("id") != user.get("id"):
        raise HTTPException(403, "Account profile not found.")
    if account.get("account_status") != "active":
        raise HTTPException(403, "This account is inactive. Contact an administrator.")
    request.state.account = account
    request.state.access_token = token
    return account


def require_admin(request: Request):
    account = authenticated_account(request)
    if account.get("role") != "admin":
        raise HTTPException(403, "Admin access required.")
    return account


class StatusChange(BaseModel):
    status: Literal["active", "inactive"]


@router.get("/dashboard")
def dashboard(request: Request, account=Depends(require_admin)):
    return supabase_request("/rest/v1/rpc/admin_read", request.state.access_token, {"section": "dashboard"})


@router.get("/users")
@router.get("/classes")
@router.get("/activity-logs")
def listing(request: Request, search: str = "", role: Literal["all", "admin", "student", "teacher"] = "all",
            status: Literal["all", "active", "inactive"] = "all", page: int = 1, date: str = "", account=Depends(require_admin)):
    from datetime import datetime
    if page < 1 or page > 100000 or len(search) > 200:
        raise HTTPException(422, "Invalid page or search length.")
    if date:
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(422, "Use a valid YYYY-MM-DD date.") from None
    section = {"activity-logs": "logs"}.get(request.url.path.rsplit("/", 1)[-1], request.url.path.rsplit("/", 1)[-1])
    return supabase_request("/rest/v1/rpc/admin_read", request.state.access_token,
        {"section": section, "filters": {"search": search, "role": role, "status": status, "page": page, "date": date}})


@router.get("/users/{record_id}")
@router.get("/classes/{record_id}")
def detail(record_id: str, request: Request, account=Depends(require_admin)):
    section = "user" if "/users/" in request.url.path else "class"
    return supabase_request("/rest/v1/rpc/admin_read", request.state.access_token,
        {"section": section, "filters": {"id": record_id}})


@router.patch("/users/{record_id}/status")
def change_status(record_id: str, body: StatusChange, request: Request, account=Depends(require_admin)):
    return supabase_request("/rest/v1/rpc/admin_set_account_status", request.state.access_token,
        {"target_user_id": record_id, "new_status": body.status})


def install_account_guard(app):
    """Existing backend operations now reject inactive sessions as well."""
    @app.middleware("http")
    async def guard(request, call_next):
        path = request.url.path
        if path in ("/health", "/api/health"):
            return await call_next(request)
        protected = path.startswith("/api/") or path in ("/upload", "/upload-stream") or path.startswith("/uploads/")
        # Preserve the existing provider callback contract; it has no user JWT.
        callback = path.startswith("/api/plagiarism/webhook/")
        if request.method != "OPTIONS" and protected and not callback:
            try:
                account = await run_in_threadpool(authenticated_account, request)
                if account.get("role") == "admin" and not path.startswith("/api/admin/"):
                    raise HTTPException(403, "Admin accounts monitor the system and cannot perform classroom operations.")
            except HTTPException as exc:
                return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        return await call_next(request)
