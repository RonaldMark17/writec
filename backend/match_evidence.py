"""Persist only text-coordinate evidence from authenticated Copyleaks exports.

The completed callback contains summary sources, not detailed comparison spans.
Export artifacts arrive independently; scan UUIDs prevent mixing versions.
"""
import os
import uuid
import logging
from urllib.parse import quote
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from admin_api import supabase_request
from copyleaks_service import copyleaks_service

router = APIRouter()
log = logging.getLogger(__name__)
EXPORT_WAIT_SECONDS = 300
MAX_EXPORT_ATTEMPTS = 3


def export_age(checkpoint):
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(checkpoint['evidence_exported_at'])).total_seconds()
    except (KeyError, TypeError, ValueError):
        return float('inf')


def export_checkpoint(checkpoint):
    return {**checkpoint, 'evidence_export': 'requested',
            'evidence_export_attempts': int(checkpoint.get('evidence_export_attempts') or 0) + 1,
            'evidence_exported_at': datetime.now(timezone.utc).isoformat()}


def queue_missing_evidence(job, sources, background_tasks):
    """Claim missing evidence without submitting a new paid scan.

    A conditional database update claims the export across concurrent status
    requests. Pending claims are reused; expired/failed claims have a bounded
    retry budget. The caller excludes reports whose stored evidence is ready.
    """
    checkpoint = (job or {}).get('checkpoint') or {}
    if (not job or job.get('state') != 'ready'
            or not any(source.get('id') for source in sources)):
        return
    previous = checkpoint.get('evidence_export')
    if previous == 'ready' or int(checkpoint.get('evidence_export_attempts') or 0) >= MAX_EXPORT_ATTEMPTS:
        return
    if previous and export_age(checkpoint) < EXPORT_WAIT_SECONDS:
        return
    # Compare the observed claim timestamp as well as its state. Only one reader
    # can replace an expired/failed claim; ordinary polling never repeats exports.
    condition = ('&checkpoint->>evidence_export=eq.' + quote(previous, safe='')
                 if previous else '&checkpoint->>evidence_export=is.null')
    stamp = checkpoint.get('evidence_exported_at')
    condition += ('&checkpoint->>evidence_exported_at=eq.' + quote(stamp, safe='')
                  if stamp else '&checkpoint->>evidence_exported_at=is.null')
    checkpoint = export_checkpoint(checkpoint)
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    claimed = supabase_request('/rest/v1/submission_jobs?id=eq.' + str(uuid.UUID(job['id']))
        + '&state=eq.ready' + condition, token,
        {'checkpoint': checkpoint}, method='PATCH')
    if claimed:
        job['checkpoint'] = checkpoint
        background_tasks.add_task(export_saved_evidence, job['id'], sources, checkpoint)


def export_saved_evidence(job_id, sources, checkpoint):
    try:
        copyleaks_service.export_match_evidence('j' + uuid.UUID(job_id).hex, sources,
            os.getenv('COPYLEAKS_WEBHOOK_BASE_URL') or os.getenv('COPYLEAKS_WEBHOOK_URL') or '')
    except Exception as error:
        log.warning('Evidence export failed job=%s error_type=%s', job_id, type(error).__name__)
        # Failed export never changes the completed score or initiates a rescan.
        supabase_request('/rest/v1/submission_jobs?id=eq.' + str(uuid.UUID(job_id))
            + '&checkpoint->>evidence_export=eq.requested'
            + ('&checkpoint->>evidence_exported_at=eq.' + quote(checkpoint['evidence_exported_at'], safe='')
               if checkpoint.get('evidence_exported_at') else ''), os.environ['SUPABASE_SERVICE_ROLE_KEY'],
            {'checkpoint': {**checkpoint, 'evidence_export': 'unavailable'}}, method='PATCH')


def compact_artifact(artifact, payload):
    if artifact == 'completion':
        return {'completed': payload.get('completed') is True}
    if artifact == 'crawled':
        value = (payload.get('text') or {}).get('value')
        if not isinstance(value, str):
            raise ValueError('Missing crawled text.')
        return {'text': value}
    comparison = (payload.get('text') or {}).get('comparison') or {}
    spans = []
    for kind in ('identical', 'minorChanges', 'relatedMeaning'):
        chars = ((comparison.get(kind) or {}).get('source') or {}).get('chars') or {}
        starts, lengths = chars.get('starts') or [], chars.get('lengths') or []
        if not isinstance(starts, list) or not isinstance(lengths, list):
            continue
        for start, length in zip(starts, lengths):
            if type(start) is int and type(length) is int and start >= 0 and length > 0:
                spans.append({'start': start, 'end': start + length, 'kind': kind})
    return {'ranges': spans}


@router.post('/api/plagiarism/evidence/{scan_id}/{artifact}')
async def receive_evidence(scan_id: str, artifact: str, request: Request):
    # Signed per artifact, not a teacher/student route. No provider-supplied URLs are fetched.
    supplied = request.headers.get('x-writecheck-evidence')
    if artifact == 'completion':
        supplied = request.query_params.get('token')
    if not copyleaks_service.verify_webhook(f'evidence:{scan_id}:{artifact}', supplied):
        raise HTTPException(403, 'Invalid evidence authentication.')
    try:
        if not scan_id.startswith('j'):
            raise ValueError()
        job_id = str(uuid.UUID(hex=scan_id[1:]))
    except ValueError:
        raise HTTPException(400, 'Invalid scan identity.') from None
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    jobs = supabase_request('/rest/v1/submission_jobs?id=eq.' + job_id + '&select=id,submission_id,provider_result', token)
    if not jobs:
        raise HTTPException(404, 'Scan has been replaced or removed.')
    summary = jobs[0].get('provider_result') or {}
    if (summary.get('scannedDocument') or {}).get('scanId') != scan_id:
        raise HTTPException(409, 'Scan summary not available.')
    ids = {str(m['id']) for kind in ('internet', 'database', 'repositories')
           for m in ((summary.get('results') or {}).get(kind) or []) if m.get('id')}
    if artifact not in ('crawled', 'completion') and artifact not in ids:
        raise HTTPException(404, 'Unknown source result.')
    try:
        data = compact_artifact(artifact, await request.json())
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, 'Invalid match evidence.') from None
    # Idempotent upsert of one artifact; simultaneous callbacks cannot overwrite each other.
    supabase_request('/rest/v1/rpc/save_submission_match_artifact', token,
                     {'job_key': job_id, 'artifact_key': artifact, 'artifact_data': data})
    log.info('Evidence callback saved scan=%s artifact=%s submission=%s signature_valid=true ranges=%s',
             scan_id, artifact, jobs[0].get('submission_id'), len(data.get('ranges', [])))
    return {'saved': True}


def attach_evidence(report, artifacts):
    """Project export data onto verified reports without replacing sources or scores."""
    report = dict(report)
    crawled = artifacts.get('crawled', {}).get('text')
    if isinstance(crawled, str):
        display = report.get('transcribedText') or ''
        log.debug('Evidence text scan=%s provider_units=%s display_units=%s exact=%s',
                  report.get('scanId'), len(crawled.encode('utf-16-le')) // 2,
                  len(display.encode('utf-16-le')) // 2, crawled == display)
    sources = []
    for source in report.get('matchedSources') or []:
        source = dict(source)
        detail = artifacts.get(str(source.get('id')))
        if detail is not None and isinstance(crawled, str):
            # Copyleaks/JS char coordinates use UTF-16 units. Decode boundaries strictly.
            encoded = crawled.encode('utf-16-le')
            fragments = []
            for span in detail.get('ranges') or []:
                start, end = span.get('start'), span.get('end')
                if (type(start) is not int or type(end) is not int
                        or start < 0 or end > len(encoded) // 2 or start >= end):
                    continue
                try:
                    phrase = encoded[start * 2:end * 2].decode('utf-16-le')
                except UnicodeDecodeError:
                    continue
                fragment = {'matched_text': phrase, 'match_kind': span['kind']}
                if crawled == report.get('transcribedText'):
                    fragment.update(start=start, end=end)
                # If provider text was reformatted, only exact uniquely located text is safe.
                fragments.append(fragment)
            source['matching_fragments'] = fragments
        sources.append(source)
    report['matchedSources'] = sources
    expected = [str(s['id']) for s in sources if s.get('id')]
    report['evidenceStatus'] = ('ready' if isinstance(crawled, str) and all(i in artifacts for i in expected)
                              else 'unavailable' if artifacts.get('completion', {}).get('completed') else 'loading')
    return report
