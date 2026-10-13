"""Owner-only classroom settings; use caller credentials and existing RLS."""
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
from admin_api import authenticated_account, supabase_request

router = APIRouter(prefix='/api/classrooms', tags=['Classrooms'])


class ClassroomName(BaseModel):
    name: str

    @field_validator('name')
    @classmethod
    def required_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Classroom name is required.')
        return value


@router.patch('/{classroom_id}/name')
def rename_classroom(classroom_id: UUID, body: ClassroomName, request: Request):
    account = authenticated_account(request)
    if account.get('role') != 'teacher':
        raise HTTPException(403, 'Only the classroom teacher can rename this classroom.')
    token = request.state.access_token
    scope = '/rest/v1/classroomTable?id=eq.' + str(classroom_id) + '&teacher_id=eq.' + str(UUID(account['id']))
    rows = supabase_request(scope + '&select=id,classroom_name,classroom_code,teacher_id', token)
    if not rows:
        raise HTTPException(403, 'You cannot rename this classroom.')
    if rows[0]['classroom_name'] == body.name:
        return rows[0]
    updated = supabase_request(scope + '&select=id,classroom_name,classroom_code,teacher_id', token,
        {'classroom_name': body.name}, method='PATCH')
    if not updated:
        raise HTTPException(403, 'You cannot rename this classroom.')
    return updated[0]
