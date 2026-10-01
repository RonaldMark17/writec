"""Public Contact Us endpoint; SMTP configuration stays on the server."""
import os
import re
import time
import threading
from collections import deque
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from notifications import send_email

router = APIRouter()
_limits = {}
_lock = threading.Lock()
EMAIL = re.compile(r'^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$')


class ContactMessage(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=10000)


def check_rate_limit(key):
    now = time.monotonic()
    with _lock:
        for host in list(_limits):
            while _limits[host] and _limits[host][0] <= now - 600:
                _limits[host].popleft()
            if not _limits[host]:
                del _limits[host]
        queue = _limits.setdefault(key, deque())
        if len(queue) >= 5 or len(_limits) > 10000:
            raise HTTPException(429, 'Too many messages. Please try again later.')
        queue.append(now)


@router.post('/api/contact')
def contact(body: ContactMessage, request: Request):
    values = {key: getattr(body, key).strip() for key in ('name', 'email', 'subject', 'message')}
    if not all(values.values()) or not EMAIL.fullmatch(values['email']):
        raise HTTPException(422, 'Enter all required fields and a valid email address.')
    recipient = os.getenv('CONTACT_RECIPIENT_EMAIL', '').strip()
    if not EMAIL.fullmatch(recipient) or not os.getenv('SMTP_HOST') or not os.getenv('SMTP_FROM'):
        raise HTTPException(503, 'Contact email is not configured yet. Please try again later.')
    check_rate_limit(request.client.host if request.client else 'unknown')
    content = '\n'.join([f"Name: {values['name']}", f"Email: {values['email']}",
        f"Subject: {values['subject']}", '', values['message']])
    try:
        send_email(recipient, 'WriteCheck: Contact Us message', content, 'contact:' + str(uuid4()), reply_to=values['email'])
    except Exception:
        raise HTTPException(502, 'Your message could not be sent. Please try again later.') from None
    return {'message': 'Your message has been sent successfully.'}
