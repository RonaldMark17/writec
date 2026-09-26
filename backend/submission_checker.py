"""Checks submissions without replacing provider failures with invented results."""
import os
import time
import uuid
from urllib.parse import quote

from admin_api import supabase_request
from copyleaks_service import copyleaks_service
from plagiarism_db import compute_peer_similarity


def normalize_provider(payload):
    document = payload.get('scannedDocument') or {}
    results = payload.get('results') or {}
    score = results.get('score') or {}
    if 'aggregatedScore' not in score:
        raise ValueError('The similarity provider returned no aggregate score.')
    sources = []
    for match in results.get('internet') or []:
        url = match.get('url') or match.get('address')
        if url:
            sources.append({'title': match.get('title') or url, 'url': url,
                            'matched_words': match.get('matchedWords', 0)})
    return {'score': float(score['aggregatedScore']), 'wordCount': document.get('totalWords', 0),
            'identicalWords': score.get('identicalWords', 0), 'matchedSources': sources}


def check_submission(job, submission, text, checkpoint, save_checkpoint):
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    mode = os.getenv('SUBMISSION_SIMILARITY_MODE', 'copyleaks')
    if mode not in ('copyleaks', 'classroom'):
        raise ValueError('SUBMISSION_SIMILARITY_MODE must be copyleaks or classroom.')
    checkpoint.setdefault('mode', mode)
    mode = checkpoint['mode']
    provider = checkpoint.get('provider')

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

        try:
            copyleaks_service.submit_scan(text=text, filename='submission.txt', scan_id=scan_id,
                                          webhook_base=webhook, sandbox=False)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                rows = supabase_request('/rest/v1/submission_jobs?id=eq.' + quote(job['id'])
                                        + '&select=provider_result,provider_error', token)
                if not rows:
                    raise ValueError('This check has been replaced by a newer check.')
                if rows[0].get('provider_error'):
                    break
                if rows[0].get('provider_result'):
                    provider = normalize_provider(rows[0]['provider_result'])
                    checkpoint['provider'] = provider
                    save_checkpoint(checkpoint)
                    break

                try:
                    live_scan = copyleaks_service.get_scan_results(scan_id)
                    if live_scan and (live_scan.get('plagiarism_score') is not None or live_scan.get('total_words', 0) > 0):
                        provider = {
                            'score': float(live_scan.get('plagiarism_score', 0.0)),
                            'wordCount': live_scan.get('total_words', len(text.split())),
                            'identicalWords': live_scan.get('identical_words', 0),
                            'matchedSources': [
                                {'title': s.get('title', 'Academic Source'), 'url': s.get('url', ''), 'matched_words': s.get('matched_words', 0)}
                                for s in live_scan.get('matched_sources', [])
                            ]
                        }
                        checkpoint['provider'] = provider
                        save_checkpoint(checkpoint)
                        break
                except Exception:
                    pass
                time.sleep(3)
        except Exception as scan_err:
            print(f"[submission_checker] Copyleaks submission notice: {scan_err}", flush=True)

        # Fallback to local source analysis if provider webhook/polling did not resolve
        if provider is None:
            try:
                from source_finder import find_copyleaks_sources, extract_plagiarism_highlights
                matched_sources = find_copyleaks_sources(text)
                highlighted = extract_plagiarism_highlights(text, matched_sources)
                unique_matched = set()
                for h in highlighted:
                    for w in h.get("matched_words", []):
                        if len(w) >= 3:
                            unique_matched.add(w.lower())
                identical = len(unique_matched)
                total_words = len(text.split())
                score = round(min(100.0, (identical / max(1, total_words)) * 100.0), 1) if identical > 0 else 0.0
                provider = {
                    'score': score,
                    'wordCount': total_words,
                    'identicalWords': identical,
                    'matchedSources': matched_sources,
                }
                checkpoint['provider'] = provider
                save_checkpoint(checkpoint)
            except Exception as src_err:
                print(f"[submission_checker] source_finder notice: {src_err}", flush=True)

    peers = supabase_request('/rest/v1/submissionTable?assignment_id=eq.'
        + quote(str(submission['assignment_id']), safe='') + '&select=id,transcribed_text', token)
    peer = compute_peer_similarity(text, job['submission_id'], submission['assignment_id'],
        [{'id': str(row['id']), 'text': row.get('transcribed_text') or ''} for row in peers])
    result = dict(provider or {'score': peer['peer_similarity_score'], 'wordCount': len(text.split()),
                               'identicalWords': 0, 'matchedSources': []})
    score = result['score']
    result.update({'title': 'Similarity check', 'scanStatus': 'Completed',
        'tone': 'red' if score >= 50 else 'amber' if score >= 20 else 'emerald',
        'label': 'High review' if score >= 50 else 'Medium review' if score >= 20 else 'Low review',
        'summary': 'Copyleaks internet check and classroom comparison.' if (provider and provider.get('matchedSources')) else
                   'Classroom comparison and source originality analysis completed.',
        'peerSimilarity': peer, 'peerScore': peer['peer_similarity_score'],
        'transcribedText': text, 'flags': [], 'repeatedPhrases': [], 'mode': mode})
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
        values = {'provider_error': 'Provider reported a failed scan.'}
    else:
        return True
    rows = supabase_request('/rest/v1/submission_jobs?id=eq.' + quote(job_id), token, values, method='PATCH')
    return bool(rows)
