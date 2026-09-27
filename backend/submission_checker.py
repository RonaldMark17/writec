"""Checks submissions without replacing provider failures with invented results."""
import os
import math
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from admin_api import supabase_request
from copyleaks_service import copyleaks_service
from plagiarism_db import compute_peer_similarity
from user_preferences import teacher_preferences, review_badge


def normalize_provider(payload):
    if payload.get('status', 0) != 0:
        raise ValueError('The provider callback does not indicate a successful scan.')
    document = payload.get('scannedDocument') or {}
    results = payload.get('results') or {}
    score = results.get('score') or {}
    if 'aggregatedScore' not in score:
        raise ValueError('The similarity provider returned no aggregate score.')
    try:
        percentage = float(score['aggregatedScore'])
    except (TypeError, ValueError):
        raise ValueError('The similarity provider returned an invalid score.') from None
    if not math.isfinite(percentage) or not 0 <= percentage <= 100:
        raise ValueError('The similarity provider returned an invalid score.')
    sources = []
    for kind in ('internet', 'database', 'repositories'):
        for match in results.get(kind) or []:
            url = match.get('url') or match.get('address') or match.get('sourceUrl') or match.get('link') or ''
            sources.append({'title': match.get('title') or url or 'Provider source', 'url': url,
                            'matched_words': match.get('matchedWords', 0)})
    return {'score': percentage, 'wordCount': document.get('totalWords', 0),
            'identicalWords': score.get('identicalWords', 0), 'matchedSources': sources}


def check_submission(job, submission, text, checkpoint, save_checkpoint):
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    mode = os.getenv('SUBMISSION_SIMILARITY_MODE', 'copyleaks')
    if mode not in ('copyleaks', 'classroom'):
        raise ValueError('SUBMISSION_SIMILARITY_MODE must be copyleaks or classroom.')
    checkpoint.setdefault('mode', mode)
    mode = checkpoint['mode']
    if 'preferences' not in checkpoint:
        checkpoint['preferences'] = teacher_preferences(submission)
        save_checkpoint(checkpoint)
    preferences = checkpoint['preferences']
    if mode == 'classroom' and not preferences['peerCrossCheck']:
        raise ValueError('Classroom-only checking requires peer comparison. Enable it in your profile and recheck.')
    # Older workers saved local estimates under checkpoint['provider']. That is
    # not evidence of a completed API scan; only the actual callback is trusted.
    provider = checkpoint.get('provider') if mode == 'classroom' else None
    expected_scan_id = 'j' + uuid.UUID(job['id']).hex
    if mode == 'copyleaks' and job.get('provider_result') and not job.get('provider_error'):
        if (job['provider_result'].get('scannedDocument') or {}).get('scanId') != expected_scan_id:
            raise ValueError('The provider callback does not match this check.')
        provider = normalize_provider(job['provider_result'])
    if mode == 'copyleaks' and provider is None:
        if len(text.split()) < 20:
            raise ValueError('At least 20 words are needed for similarity checking. Correct the transcription and retry.')

        webhook = os.getenv('COPYLEAKS_WEBHOOK_BASE_URL') or os.getenv('COPYLEAKS_WEBHOOK_URL') or ''
        webhook = webhook.rstrip('/')
        if not webhook.startswith('https://') or 'localhost' in webhook:
            webhook = 'https://writecheck-scanner.vercel.app'

        if copyleaks_service.is_sandbox:
            raise ValueError('Disable COPYLEAKS_SANDBOX for real submission checks; sandbox results are simulated.')

        scan_id = 'j' + uuid.UUID(job['id']).hex
        save_checkpoint(checkpoint)
        copyleaks_service.submit_scan(text=text, filename='submission.txt', scan_id=scan_id,
                                      webhook_base=webhook, sandbox=False)
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            rows = supabase_request('/rest/v1/submission_jobs?id=eq.' + quote(job['id'])
                                    + '&select=provider_result,provider_error', token)
            if not rows:
                raise ValueError('This check has been replaced by a newer check.')
            if rows[0].get('provider_error'):
                raise ValueError(rows[0]['provider_error'])
            if rows[0].get('provider_result'):
                if (rows[0]['provider_result'].get('scannedDocument') or {}).get('scanId') != expected_scan_id:
                    raise ValueError('The provider callback does not match this check.')
                provider = normalize_provider(rows[0]['provider_result'])
                checkpoint['provider'] = provider
                save_checkpoint(checkpoint)
                break
            time.sleep(5)
        if provider is None:
            raise ValueError('Similarity results have not arrived. Verify the webhook, then retry this check.')
    peer = None
    if preferences['peerCrossCheck']:
        peers = supabase_request('/rest/v1/submissionTable?assignment_id=eq.'
            + quote(str(submission['assignment_id']), safe='') + '&select=id,transcribed_text', token)
        peer = compute_peer_similarity(text, job['submission_id'], submission['assignment_id'],
            [{'id': str(row['id']), 'text': row.get('transcribed_text') or ''} for row in peers])
    result = dict(provider or {'score': peer['peer_similarity_score'], 'wordCount': len(text.split()),
                               'identicalWords': 0, 'matchedSources': []})
    score = result['score']
    result.update({'title': 'Similarity check', 'scanStatus': 'Completed',
        **review_badge(score, preferences), 'preferences': preferences,
        'summary': ('Copyleaks internet check and classroom comparison.' if peer is not None else
                    'Copyleaks internet check. Classroom comparison disabled.') if provider else
                   'Classroom comparison only. Internet sources were not checked.',
        'peerComparisonEnabled': preferences['peerCrossCheck'],
        'peerSimilarity': peer, 'peerScore': peer['peer_similarity_score'] if peer is not None else None,
        'transcribedText': text, 'flags': [], 'repeatedPhrases': [], 'mode': mode})
    if mode == 'copyleaks':
        result.update({'provider': 'copyleaks', 'scanId': 'j' + uuid.UUID(job['id']).hex,
                       'completedAt': datetime.now(timezone.utc).isoformat()})
    return result


def record_submission_webhook(scan_id, status, payload):
    """Called only after the existing HMAC verification succeeds."""
    if not scan_id.startswith('j'):
        return False
    try:
        job_id = str(uuid.UUID(hex=scan_id[1:]))
    except ValueError:
        return False
    token = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not token:
        raise RuntimeError('Submission worker database credentials are unavailable.')
    if status == 'completed':
        normalize_provider(payload)
        values = {'provider_result': payload, 'provider_error': None}
    elif status in ('error', 'failed'):
        detail = payload.get('error') or {}
        code = detail.get('id') or detail.get('code') or 'unknown'
        # Store a bounded teacher-visible reason, not the complete provider body.
        message = str(detail.get('message') or 'The provider did not complete this scan.')[:350]
        values = {'provider_error': f'Copyleaks error ({code}): {message}'}
    else:
        return True
    rows = supabase_request('/rest/v1/submission_jobs?id=eq.' + quote(job_id), token, values, method='PATCH')
    return bool(rows)
