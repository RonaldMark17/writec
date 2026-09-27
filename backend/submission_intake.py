"""Save reviewed student text and the original file before the queue can scan it."""
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from admin_api import supabase_request
from submission_access import require_assignment, file_reference, local_file

router = APIRouter(prefix='/api/submissions', tags=['Submissions'])


class ReviewedSubmission(BaseModel):
    assignment_id: uuid.UUID
    title: str = Field(min_length=1, max_length=500)
    file_url: str = Field(min_length=1, max_length=2048)
    text: str = Field(min_length=1, max_length=250000)

    class Config:
        extra = 'forbid'


@router.post('/submit')
def submit_reviewed_work(body: ReviewedSubmission, request: Request):
    assignment_id = str(body.assignment_id)
    account = require_assignment(request, assignment_id)
    if account['role'] != 'student':
        raise HTTPException(403, 'Only students can submit work.')
    token = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not token:
        raise HTTPException(503, 'Submission processing is not configured on the server.')
    text, title = body.text.strip(), body.title.strip()
    if not text or not title:
        raise HTTPException(400, 'Review the essay text and enter a title before submitting.')
    student_id = str(uuid.UUID(account['id']))
    kind, key = file_reference(body.file_url)
    prefix = f'{student_id}/{assignment_id}/'
    if not key.startswith(('submissions/' if kind == 'local' else '') + prefix):
        raise HTTPException(403, 'The uploaded file must belong to this student and assignment.')
    if kind == 'local':
        if not local_file(request.app.state.upload_root, key).is_file():
            raise HTTPException(400, 'The uploaded file is missing. Select the file and submit again.')
        file_url = f"{str(request.base_url).rstrip('/')}/uploads/{key}"
    else:
        file_url = key

    # Stable identity makes simultaneous clicks and retries after a lost response
    # converge on the same database row without re-enqueueing or overwriting it.
    submission_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'writecheck:{student_id}:{assignment_id}'))
    query = ('/rest/v1/submissionTable?student_id=eq.' + quote(student_id)
             + '&assignment_id=eq.' + quote(assignment_id) + '&select=id&limit=1')
    existing = supabase_request(query, token)
    if existing:
        return {'id': existing[0]['id'], 'already_submitted': True}
    assignments = supabase_request('/rest/v1/assignmentTable?id=eq.' + quote(assignment_id) + '&select=*', token)
    if len(assignments) != 1:
        raise HTTPException(404, 'Assignment not found.')
    assignment = assignments[0]
    if assignment.get('due_date') and assignment.get('accept_late_submissions') is False:
        deadline = datetime.fromisoformat(assignment['due_date'].replace('Z', '+00:00'))
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > deadline:
            raise HTTPException(403, 'Submissions are closed for this assignment.')
    row = {'id': submission_id, 'student_id': student_id, 'assignment_id': assignment_id,
           'classroom_id': assignment['classroom_id'], 'essay_title': title,
           'file_url': file_url, 'transcribed_text': text, 'status': 'submitted'}
    try:
        # The existing enqueue_submission trigger creates the job in the same
        # transaction. Workers cannot see it until the image reference/text commit.
        saved = supabase_request('/rest/v1/submissionTable', token, row)
    except HTTPException:
        existing = supabase_request(query, token)
        if existing:
            return {'id': existing[0]['id'], 'already_submitted': True}
        raise
    if not saved or str(saved[0].get('id')) != submission_id:
        raise HTTPException(502, 'The submission save could not be confirmed. Please retry.')
    return {'id': submission_id, 'already_submitted': False}
