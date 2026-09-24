"""Persist submission results synchronously under the teacher's Supabase session."""
from urllib.parse import quote
from fastapi import HTTPException
from admin_api import authenticated_account, supabase_request


def read_results(request):
    authenticated_account(request)
    rows = supabase_request('/rest/v1/rpc/list_submission_results', request.state.access_token, {})
    return {str(row['id']): row for row in rows}


def save_results(request, submission_id, values):
    allowed = {'grade', 'feedback', 'status', 'transcribed_text', 'scan_result'}
    payload = {key: value for key, value in values.items() if key in allowed and value is not None}
    if 'grade' in payload:
        if not isinstance(payload['grade'], (str, int, float)) or len(str(payload['grade'])) > 120:
            raise HTTPException(422, 'Enter a valid grade.')
        payload['grade'] = str(payload['grade']).strip()
    rows = supabase_request('/rest/v1/submissionTable?id=eq.' + quote(str(submission_id), safe=''),
                            request.state.access_token, payload, method='PATCH')
    if not isinstance(rows, list) or len(rows) != 1 or str(rows[0].get('id')) != str(submission_id):
        raise HTTPException(409, 'The submission was not saved. Refresh and try again.')
    return rows[0]
