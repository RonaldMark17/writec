"""Persist only text-coordinate evidence from authenticated Copyleaks exports.

The completed callback contains summary sources, not detailed comparison spans.
Export artifacts arrive independently; scan UUIDs prevent mixing versions.
"""
import os
import uuid
from fastapi import APIRouter, HTTPException, Request
from admin_api import supabase_request
from copyleaks_service import copyleaks_service

router = APIRouter()


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
    jobs = supabase_request('/rest/v1/submission_jobs?id=eq.' + job_id + '&select=id,provider_result', token)
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
    return {'saved': True}


def attach_evidence(report, artifacts):
    """Project export data onto verified reports without replacing sources or scores."""
    report = dict(report)
    crawled = artifacts.get('crawled', {}).get('text')
    sources = []
    for source in report.get('matchedSources') or []:
        source = dict(source)
        detail = artifacts.get(str(source.get('id')))
        if detail is not None and isinstance(crawled, str):
            # Copyleaks/JS char coordinates use UTF-16 units. Decode boundaries strictly.
            encoded = crawled.encode('utf-16-le')
            fragments = []
            for span in detail.get('ranges') or []:
                start, end = span['start'], min(span['end'], len(encoded) // 2)
                if start >= end:
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
