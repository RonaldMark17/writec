"""Teacher-facing results validated against the durable provider callback."""
import os
import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from admin_api import authenticated_account, supabase_request
from submission_checker import normalize_provider
from copyleaks_service import copyleaks_service
from user_preferences import review_badge

router = APIRouter(prefix='/api/submissions', tags=['Submissions'])


def verified_status(row, job):
    row = dict(row)
    report = row.get('scan_result') or {}
    checkpoint = (job or {}).get('checkpoint') or {}
    state = (job or {}).get('state') or ('ready' if report else 'submitted')
    error = (job or {}).get('error')
    mode = checkpoint.get('mode') or ('copyleaks' if report else None)
    if state == 'ready' and (mode not in ('copyleaks', 'classroom')
                             or (mode == 'classroom' and report.get('mode') != 'classroom')):
        state = 'failed'
        error = 'The stored report does not match a verified processing mode. Recheck this submission.'
    if mode == 'copyleaks' and state == 'ready':
        payload = (job or {}).get('provider_result')
        try:
            if not payload or (job or {}).get('provider_error'):
                raise ValueError('No successful Copyleaks callback is recorded.')
            scan_id = 'j' + uuid.UUID(job['id']).hex
            if (payload.get('scannedDocument') or {}).get('scanId') != scan_id:
                raise ValueError('The callback does not match this submission check.')
            provider = normalize_provider(payload)
            # Use the actual provider percentage and sources, even if an older
            # worker subsequently replaced those fields with a local estimate.
            report = {**report, **provider, 'provider': 'copyleaks', 'scanId': scan_id,
                      'scanStatus': 'Completed', 'summary': 'Verified Copyleaks API result.'}
            score = provider['score']
            report.update(review_badge(score, checkpoint.get('preferences') or report.get('preferences') or {}))
            row['scan_result'] = report
            row['plagiarism_score'] = score
        except (ValueError, TypeError, KeyError):
            state = 'failed'
            error = ('No verified Copyleaks result is available. '
                     + ((job or {}).get('provider_error') or 'This stored report came from an older, unverified processing path.')
                     + ' Check API credits and ensure all workers use the updated backend before retrying.')
    if state != 'ready':
        row['scan_result'] = None
        row['plagiarism_score'] = None
    return row, {'state': state, 'error': error}


@router.get('/status')
def teacher_submission_status(request: Request):
    account = authenticated_account(request)
    if account.get('role') != 'teacher':
        raise HTTPException(403, 'Only teachers can inspect API processing details.')
    token = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not token:
        raise HTTPException(503, 'API result verification is not configured on the backend.')
    # Establish visibility with the teacher's own token before using server-only
    # job data. Raw checkpoints, student essays and provider payloads stay private.
    rows = supabase_request('/rest/v1/rpc/list_submission_results', request.state.access_token, {})
    jobs = {}
    for start in range(0, len(rows), 50):
        ids = ','.join(str(uuid.UUID(str(row['id']))) for row in rows[start:start + 50])
        found = supabase_request('/rest/v1/submission_jobs?submission_id=in.(' + quote(ids, safe=',')
            + ')&select=submission_id,id,state,error,provider_error,provider_result,checkpoint', token)
        jobs.update({str(job['submission_id']): job for job in found})
    results, progress = [], {}
    for row in rows:
        verified, state = verified_status(row, jobs.get(str(row['id'])))
        results.append(verified)
        progress[str(row['id'])] = state
    try:
        provider = {'credits': copyleaks_service.get_credit_balance()}
    except Exception:
        provider = {'credits': None}
    return {'results': results, 'progress': progress, 'provider': provider}
