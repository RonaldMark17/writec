"""Restrict the standalone model preview to an explicitly enabled local machine."""
import ipaddress
import os
from urllib.parse import urlparse

from fastapi import HTTPException


def require_local_ocr(request):
    if os.getenv('LOCAL_OCR_ENABLED', '0') != '1':
        raise HTTPException(403, 'Local transcription is disabled on this server.')
    host = request.client.host if request.client else ''
    try:
        local = ipaddress.ip_address(host).is_loopback
    except ValueError:
        local = False
    origin = request.headers.get('origin')
    if not local or (origin and urlparse(origin).hostname not in ('localhost', '127.0.0.1', '::1')):
        raise HTTPException(403, 'Open local transcription on the backend computer using localhost.')
