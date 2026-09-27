"""Authenticated readiness information without secrets or filesystem paths."""
import os
from fastapi import APIRouter, Request
from admin_api import authenticated_account
from copyleaks_service import copyleaks_service
from notifications import configured

router = APIRouter(prefix='/api/preferences', tags=['Preferences'])


@router.get('/services')
def services(request: Request):
    authenticated_account(request)
    if not os.getenv('COPYLEAKS_EMAIL') or not os.getenv('COPYLEAKS_API_KEY'):
        provider = 'Not configured'
    else:
        try:
            credits = copyleaks_service.get_credit_balance()
            if credits is None:
                provider = 'Credit status unavailable'
            elif copyleaks_service.is_sandbox:
                provider = 'Sandbox mode — simulated scans'
            elif credits <= 0:
                provider = 'No credits available'
            else:
                provider = f'Authenticated — {credits:g} credits'
        except Exception:
            provider = 'Unavailable — check credentials or connection'
    return {'copyleaks': provider,
            'ocr': 'Models loaded' if getattr(request.app.state, 'ocr_ready', False) else 'Not ready',
            'notifications': {'configured': configured(),
                'message': 'Email dispatcher enabled' if configured() else 'Email disabled — SMTP setup and dispatcher activation required'}}
