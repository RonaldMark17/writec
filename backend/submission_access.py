"""Authorization shared by submission, scan, and download endpoints."""
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit, quote
from fastapi import HTTPException
from admin_api import authenticated_account, supabase_request


def visible_submissions(request):
    authenticated_account(request)
    rows = supabase_request('/rest/v1/rpc/accessible_submissions', request.state.access_token, {})
    if not isinstance(rows, list):
        raise HTTPException(503, 'Submission permissions are unavailable. Apply submission_security.sql.')
    return rows


def require_submission(request, submission_id, teacher_only=False):
    account = authenticated_account(request)
    if teacher_only and account['role'] != 'teacher':
        raise HTTPException(403, 'Only the classroom teacher can change submission results.')
    for row in visible_submissions(request):
        if str(row['id']) == str(submission_id):
            return row
    raise HTTPException(404, 'Submission not found or not accessible.')


def require_assignment(request, assignment_id, teacher_only=False):
    account = authenticated_account(request)
    if not assignment_id or (teacher_only and account['role'] != 'teacher'):
        raise HTTPException(403, 'Assignment access denied.')
    allowed = supabase_request('/rest/v1/rpc/can_use_assignment', request.state.access_token,
        {'assignment_key': str(assignment_id), 'teacher_only': teacher_only})
    if allowed is not True:
        raise HTTPException(403, 'Assignment access denied.')
    return account


def require_scan(request, record):
    account = authenticated_account(request)
    if not record or str(record.get('user_id')) != str(account['id']):
        raise HTTPException(404, 'Scan not found or not accessible.')
    return record


def file_reference(value):
    """Return an exact local/storage key, never a basename search or filesystem path."""
    value = str(value or '')
    if '\\' in value or '\x00' in value:
        raise HTTPException(400, 'Invalid file path.')
    parsed = urlsplit(value)
    path = unquote(parsed.path) if parsed.scheme in ('http', 'https') else unquote(value.split('?', 1)[0])
    if parsed.scheme and parsed.scheme not in ('http', 'https'):
        raise HTTPException(400, 'Invalid file path.')
    if path.startswith('/uploads/'):
        path = path[len('/uploads/'):]
        kind = 'local'
    elif '/essay-submissions/' in path and path.startswith('/storage/v1/object/'):
        path = path.split('/essay-submissions/', 1)[1]
        kind = 'storage'
    elif path.startswith('essay-submissions/'):
        path = path[len('essay-submissions/'):]
        kind = 'storage'
    else:
        kind = 'local' if path.startswith('submissions/') else 'storage'
    if not path or path.startswith('/') or any(p in ('', '.', '..') for p in path.split('/')) or '\\' in path or ':' in path:
        raise HTTPException(400, 'Invalid file path.')
    return kind, path


def require_file(request, reference, kind=None):
    wanted = file_reference(reference)
    if kind is not None:
        wanted = (kind, wanted[1])
    for row in visible_submissions(request):
        if row.get('file_url') and file_reference(row['file_url']) == wanted:
            return wanted
    raise HTTPException(404, 'File not found or not accessible.')


def local_file(root, key):
    root = Path(root).resolve()
    result = (root / PurePosixPath(key)).resolve()
    if not result.is_relative_to(root):
        raise HTTPException(400, 'Invalid file path.')
    return result


def storage_download(request, key):
    """Download using the caller token so Storage RLS is also enforced."""
    import os
    import urllib.request
    import urllib.error
    url = os.getenv('SUPABASE_URL', 'https://qtqvnutcalmmqmmbwueu.supabase.co').rstrip('/')
    from admin_api import supabase_headers
    req = urllib.request.Request(f'{url}/storage/v1/object/authenticated/essay-submissions/{quote(key, safe="/")}',
        headers=supabase_headers(request.state.access_token))
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.read()
    except urllib.error.HTTPError:
        raise HTTPException(404, 'File not found or not accessible.') from None
    except (urllib.error.URLError, TimeoutError):
        raise HTTPException(503, 'File storage is unavailable.') from None
