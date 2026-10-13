"""Teacher-facing results validated against the durable provider callback."""
import os
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from admin_api import authenticated_account, supabase_request
from submission_checker import normalize_provider
from copyleaks_service import copyleaks_service
from user_preferences import review_badge
from match_evidence import attach_evidence, queue_missing_evidence, export_age, EXPORT_WAIT_SECONDS

router = APIRouter(prefix='/api/submissions', tags=['Submissions'])


def verified_status(row, job, artifacts=None):
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
            if ('transcribedText' not in report and artifacts
                    and artifacts.get('crawled', {}).get('text') == row.get('transcribed_text')):
                # Older summary serializers omitted this binding. Restore it
                # only from an exact provider-text comparison, never the score.
                report['transcribedText'] = row['transcribed_text']
            if not provider['matchedSources']:
                report['evidenceStatus'] = 'ready'
            elif artifacts:
                report = attach_evidence(report, artifacts)
            else:
                report['evidenceStatus'] = 'unavailable'
            if report.get('evidenceStatus') in ('loading', 'unavailable'):
                waiting = checkpoint.get('evidence_export') == 'requested' and 0 <= export_age(checkpoint) < EXPORT_WAIT_SECONDS
                # A completion from a previous failed export must not terminate
                # a new claim while its delayed callbacks are still arriving.
                report['evidenceStatus'] = 'loading' if waiting else 'unavailable'
            score = provider['score']
            report.update(review_badge(score, checkpoint.get('preferences') or report.get('preferences') or {}))
            row['scan_result'] = report
            row['plagiarism_score'] = score
        except (ValueError, TypeError, KeyError):
            state = 'failed'
            error = ('No verified Copyleaks result is available. '
                     + ((job or {}).get('provider_error') or 'This stored report came from an older, unverified processing path.')
                     + ' Check API credits and ensure all workers use the updated backend before retrying.')
    if report.get('stale') or (isinstance(report.get('transcribedText'), str) and report['transcribedText'] != row.get('transcribed_text')):
        row['scan_result'] = {**report, 'stale': True}
        row['plagiarism_score'] = None
    if state != 'ready':
        row['scan_result'] = None
        row['plagiarism_score'] = None
    return row, {'state': state, 'error': error}


@router.get('/status')
def teacher_submission_status(request: Request, background_tasks: BackgroundTasks):
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
    evidence = {}
    # One batch per existing status batch; no per-student/provider calls.
    job_ids = [str(uuid.UUID(job['id'])) for job in jobs.values()]
    try:
        for start in range(0, len(job_ids), 50):
            found = supabase_request('/rest/v1/submission_match_evidence?job_id=in.('
                + ','.join(job_ids[start:start + 50]) + ')&select=job_id,artifact,data', token)
            for item in found:
                evidence.setdefault(str(item['job_id']), {})[item['artifact']] = item['data']
    except Exception:
        # Deployments without the evidence migration retain normal review/grades.
        evidence = {}
    results, progress = [], {}
    for row in rows:
        job = jobs.get(str(row['id']))
        verified, state = verified_status(row, job, evidence.get(str((job or {}).get('id'))))
        report = verified.get('scan_result') or {}
        if (state['state'] == 'ready' and not report.get('stale')
                and report.get('provider') == 'copyleaks' and report.get('evidenceStatus') == 'unavailable'):
            try:
                queue_missing_evidence(job, report.get('matchedSources') or [], background_tasks)
                verified, state = verified_status(row, job, evidence.get(str((job or {}).get('id'))))
            except Exception:
                # Missing storage/configuration must not hide the existing report.
                pass
        results.append(verified)
        progress[str(row['id'])] = state
    try:
        provider = {'credits': copyleaks_service.get_credit_balance()}
    except Exception:
        provider = {'credits': None}
    return {'results': results, 'progress': progress, 'provider': provider}
