"""Load authoritative, assignment-scoped inputs for the existing peer calculator."""
from urllib.parse import quote
from admin_api import supabase_request
from plagiarism_db import compute_peer_similarity


def inspect_classmate_pair(current, matched, saved, token):
    """Called only after teacher access and pair scope have been verified."""
    left, right = saved[str(current['id'])], saved[str(matched['id'])]
    names = supabase_request('/rest/v1/userTable?id=in.('
        + ','.join(quote(str(row['student_id']), safe='') for row in (current, matched))
        + ')&select=id,full_name', token)
    names = {str(row['id']): row.get('full_name') or 'Student' for row in names}
    assignments = supabase_request('/rest/v1/assignmentTable?id=eq.' + quote(str(current['assignment_id']), safe='')
        + '&classroom_id=eq.' + quote(str(current['classroom_id']), safe='') + '&select=title', token)
    classrooms = supabase_request('/rest/v1/classroomTable?id=eq.' + quote(str(current['classroom_id']), safe='')
        + '&select=classroom_name,subject', token)
    report = compute_peer_similarity(left.get('transcribed_text') or '', current['id'], current['assignment_id'],
        [{**matched, 'text': right.get('transcribed_text') or ''}],
        classroom_id=current['classroom_id'], current_student_id=current['student_id'])
    def answer(identity, row):
        return {'submission_id': str(identity['id']), 'student_name': names.get(str(identity['student_id']), 'Student'),
                'submitted_at': row.get('created_at'), 'status': row.get('status'),
                'text': row.get('transcribed_text') or ''}
    return {'assignment_title': assignments[0]['title'] if assignments else 'Assignment',
            'classroom_name': classrooms[0]['classroom_name'] if classrooms else 'Classroom',
            'subject': classrooms[0].get('subject') if classrooms else None,
            'score_percent': report['peer_similarity_score'], 'matching_snippets': report['matching_snippets'],
            'left': answer(current, left), 'right': answer(matched, right)}


def load_classmates(submission, token):
    if any(not submission.get(key) for key in ('id', 'student_id', 'classroom_id', 'assignment_id')):
        raise ValueError('Submission, student, classroom and assignment are required for peer comparison.')
    classroom = str(submission['classroom_id'])
    assignment = str(submission['assignment_id'])
    peers = []
    offset = 0
    while True:
        rows = supabase_request('/rest/v1/submissionTable?classroom_id=eq.'
            + quote(classroom, safe='') + '&assignment_id=eq.' + quote(assignment, safe='')
            + '&select=id,student_id,classroom_id,assignment_id,transcribed_text&order=id&limit=100&offset='
            + str(offset), token)
        if not rows:
            break
        for row in rows:
            if (not row.get('id') or not row.get('student_id')
                    or str(row.get('classroom_id')) != classroom or str(row.get('assignment_id')) != assignment
                    or str(row.get('id')) == str(submission.get('id'))
                    or str(row.get('student_id')) == str(submission.get('student_id'))):
                continue
            peers.append({**row, 'text': row.get('transcribed_text') or ''})
        offset += len(rows)
    # Fetch only names for students found inside this classroom and assignment.
    names = {}
    ids = sorted({str(row['student_id']) for row in peers if row.get('student_id')})
    for index in range(0, len(ids), 100):
        rows = supabase_request('/rest/v1/userTable?id=in.('
            + ','.join(quote(value, safe='') for value in ids[index:index + 100])
            + ')&select=id,full_name', token)
        names.update({str(row['id']): row.get('full_name') for row in rows})
    return [{**row, 'student_name': names.get(str(row['student_id'])) or 'Classmate'} for row in peers]
