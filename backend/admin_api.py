"""Admin API using the caller's verified Supabase session, never a frontend role."""
import json
import os
import re
import urllib.error
import urllib.request
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr
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
        if path == "/auth/v1/admin/users" and exc.code in (400, 422):
            try:
                failure = json.loads(exc.read())
                code = failure.get("error_code") or failure.get("code")
            except (ValueError, AttributeError):
                code = None
            if code in ("email_exists", "user_already_exists"):
                raise HTTPException(409, "This email is already registered. Find the existing account in Users.") from None
            raise HTTPException(422, "Account creation was rejected. Check the email domain, password requirements, and registration migrations.") from None
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
        raise HTTPException(403, {"pending": "Your account is awaiting administrator approval.",
            "rejected": "Your registration was rejected. Contact an administrator for assistance."}.get(
                account.get("account_status"), "This account is inactive. Contact an administrator."))
    request.state.account = account
    request.state.access_token = token
    return account


def require_admin(request: Request):
    account = authenticated_account(request)
    if account.get("role") != "admin":
        raise HTTPException(403, "Admin access required.")
    return account


class StatusChange(BaseModel):
    status: Literal["active", "inactive", "rejected"]


class AccountCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr
    role: Literal["student", "teacher"]


@router.post("/users", status_code=201)
def create_account(body: AccountCreate, request: Request, account=Depends(require_admin)):
    email = body.email.strip().lower()
    name = body.full_name.strip()
    password = body.password.get_secret_value()
    if not name or not re.fullmatch(r"[^\s@]+@(edu\.com\.ph|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+edu\.ph)", email):
        raise HTTPException(422, "Enter a name and an institutional email ending in @edu.com.ph or .edu.ph.")
    if not 8 <= len(password) <= 128:
        raise HTTPException(422, "Password must contain 8 to 128 characters.")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise HTTPException(503, "Account creation requires the backend SUPABASE_SERVICE_ROLE_KEY setting.")
    # Never sign up in the admin's browser: that could replace the admin session.
    created = supabase_request("/auth/v1/admin/users", service_key, {
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": name, "role": body.role},
    })
    user_id = created.get("id")
    if not user_id:
        raise HTTPException(502, "Unexpected account creation response. Check Users before retrying.")
    try:
        result = supabase_request("/rest/v1/rpc/admin_set_account_status", request.state.access_token,
            {"target_user_id": user_id, "new_status": "active"})
        if result.get("account_status") != "active":
            raise HTTPException(502, "Approval was not confirmed.")
    except HTTPException:
        # Auth creation already succeeded. Do not invite a duplicate retry or delete a real account.
        return {"id": user_id, "email": email, "warning":
            "Account created, but approval could not be completed. Refresh Pending Approvals; if absent, apply admin_registration_repair.sql. Do not create it again."}
    return {"id": user_id, "email": email, "role": body.role, "account_status": "active"}


@router.get("/dashboard")
def dashboard(request: Request, account=Depends(require_admin)):
    result = supabase_request("/rest/v1/rpc/admin_read", request.state.access_token, {"section": "dashboard"})
    pending = supabase_request("/rest/v1/rpc/admin_read", request.state.access_token,
        {"section": "users", "filters": {"status": "pending", "page": 1}})
    return {**result, "pending": pending.get("total", 0)}


@router.get("/users")
@router.get("/classes")
@router.get("/activity-logs")
def listing(request: Request, search: str = "", role: Literal["all", "admin", "student", "teacher"] = "all",
            status: Literal["all", "active", "inactive", "pending", "rejected"] = "all", page: int = 1, date: str = "", account=Depends(require_admin)):
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
        if path in ("/health", "/api/health", "/api/contact") or (path.startswith("/api/users/") and path.endswith("/avatar") and request.method == "GET"):
            return await call_next(request)
        protected = path.startswith("/api/") or path in ("/upload", "/upload-stream") or path.startswith("/uploads/")
        # Preserve the existing provider callback contract; it has no user JWT.
        callback = path.startswith("/api/plagiarism/webhook/")
        if request.method != "OPTIONS" and protected and not callback:
            try:
                account = await run_in_threadpool(authenticated_account, request)
                if account.get("role") == "admin" and not path.startswith(("/api/admin/", "/api/preferences/")):
                    raise HTTPException(403, "Admin accounts monitor the system and cannot perform classroom operations.")
            except HTTPException as exc:
                return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        return await call_next(request)
