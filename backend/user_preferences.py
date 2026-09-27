"""Non-privileged settings stored in Supabase Auth user metadata."""
import os
from urllib.parse import quote
from admin_api import supabase_request


def detection_preferences(metadata):
    saved = metadata.get('writecheck_preferences') or {}
    if not isinstance(saved, dict):
        saved = {}
    sensitivity = saved.get('plagiarismSensitivity', 'standard')
    if sensitivity not in ('standard', 'strict', 'permissive'):
        sensitivity = 'standard'
    return {'plagiarismSensitivity': sensitivity,
            'peerCrossCheck': saved.get('peerCrossCheck') is not False}


def review_badge(score, preferences):
    threshold = {'strict': 5, 'standard': 10, 'permissive': 20}.get(
        preferences.get('plagiarismSensitivity'), 10)
    return {'alertThreshold': threshold,
            'tone': 'red' if score >= 50 else 'amber' if score >= threshold else 'emerald',
            'label': 'High review' if score >= 50 else 'Review suggested' if score >= threshold else 'Low review'}


def teacher_preferences(submission):
    token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    rows = supabase_request('/rest/v1/assignmentTable?id=eq.' + quote(str(submission['assignment_id']), safe='')
                            + '&select=teacher_id', token)
    if len(rows) != 1 or not rows[0].get('teacher_id'):
        raise ValueError('The assignment teacher could not be found.')
    user = supabase_request('/auth/v1/admin/users/' + quote(str(rows[0]['teacher_id']), safe=''), token)
    return detection_preferences(user.get('user_metadata') or {})
