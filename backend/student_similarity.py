"""Read-only, anonymous student projection of verified saved similarity reports."""
import math
import os
from urllib.parse import quote, urlsplit
from fastapi import HTTPException
from admin_api import authenticated_account, supabase_request
from submission_access import require_submission, require_assignment


def percentage(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) and 0 <= number <= 100 else None
    except (ValueError, TypeError):
        return None


def public_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username else None
    except ValueError:
        return None


def student_similarity(request, submission_id):
    account = authenticated_account(request)
    if account['role'] != 'student':
        raise HTTPException(403, 'Student access required.')
    identity = require_submission(request, submission_id)
    if str(identity['student_id']) != str(account['id']):
        raise HTTPException(404, 'Submission not accessible.')
    require_assignment(request, identity['assignment_id'])
    # Explicit enrollment check, including for archived classroom reads.
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    def read(path):
        return supabase_request('/rest/v1/' + path, token)
    classroom = quote(str(identity['classroom_id']), safe='')
    student = quote(str(account['id']), safe='')
    if not read('classroomMembers?classroom_id=eq.' + classroom + '&student_id=eq.' + student + '&select=student_id'):
        raise HTTPException(403, 'Classroom enrollment required.')
    key = quote(str(identity['id']), safe='')
    jobs = read('submission_jobs?submission_id=eq.' + key + '&select=state,provider_result')
    if not jobs:
        return {'state': 'unavailable'}
    state = jobs[0]['state']
    if state != 'ready':
        return {'state': state if state in ('submitted', 'processing', 'failed') else 'unavailable'}
    if supabase_request('/rest/v1/rpc/submission_report_verified', request.state.access_token,
                        {'submission_key': str(identity['id'])}) is not True:
        return {'state': 'unavailable'}
    rows = read('submissionTable?id=eq.' + key + '&student_id=eq.' + student
                + '&classroom_id=eq.' + classroom + '&assignment_id=eq.'
                + quote(str(identity['assignment_id']), safe='') + '&select=scan_result')
    report = rows[0].get('scan_result') if rows else None
    if not isinstance(report, dict):
        return {'state': 'unavailable'}
    external = report.get('mode') == 'copyleaks'
    score = percentage(report.get('score')) if external else None
    if external and score is None:
        return {'state': 'unavailable'}
    sources = []
    # Read actual provider fields; do not forward titles manufactured by normalization.
    provider = jobs[0].get('provider_result') or {}
    results = provider.get('results') or {}
    if external:
        for kind in ('internet', 'database', 'repositories'):
            for match in results.get(kind) or []:
                url = public_url(match.get('url') or match.get('address') or match.get('sourceUrl') or match.get('link'))
                source = {}
                if isinstance(match.get('title'), str) and match['title'].strip():
                    source['title'] = match['title']
                if isinstance(match.get('domain'), str) and match['domain'].strip():
                    source['domain'] = match['domain']
                if url:
                    source.update(url=url, domain=urlsplit(url).hostname)
                if isinstance(match.get('matchedWords'), int) and match['matchedWords'] >= 0:
                    source['matched_words'] = match['matchedWords']
                if source:
                    sources.append(source)
    peers = []
    seen = set()
    peer_report = report.get('peerSimilarity') or {}
    for match in peer_report.get('all_matches') or []:
        peer_id = str(match.get('submission_id') or '')
        value = percentage(match.get('score_percent'))
        if not peer_id or peer_id == str(identity['id']) or peer_id in seen or value is None:
            continue
        # Verify stored matches still belong to this assignment/classroom; return no identifiers.
        candidates = read('submissionTable?id=eq.' + quote(peer_id, safe='') + '&select=id,student_id,classroom_id,assignment_id')
        if not candidates:
            continue
        peer = candidates[0]
        if (str(peer.get('id')) == peer_id and str(peer.get('student_id')) != str(identity['student_id'])
                and peer.get('student_id') is not None
                and str(peer.get('classroom_id')) == str(identity['classroom_id'])
                and str(peer.get('assignment_id')) == str(identity['assignment_id'])):
            peers.append({'score': value})
            seen.add(peer_id)
    return {'state': 'ready', 'score': score, 'mode': report.get('mode'), 'sources': sources,
            'peers': peers, 'passages': []}
