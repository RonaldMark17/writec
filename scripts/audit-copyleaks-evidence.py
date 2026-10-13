"""Audit saved Copyleaks evidence; optionally claim missing exports (never rescan).

Run from the repository root. --recover uses the configured public callback host.
The default output contains IDs/counts only, not student names or essay text.
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi import BackgroundTasks
from admin_api import supabase_request
from submission_checker import normalize_provider
from submission_status import verified_status
from match_evidence import queue_missing_evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recover', action='store_true')
    parser.add_argument('--reports', type=Path, help='Optional private JSON output containing essay text for local browser verification.')
    args = parser.parse_args()
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    reports = []
    offset = 0
    while True:
        jobs = supabase_request('/rest/v1/submission_jobs?state=eq.ready'
            '&select=id,submission_id,state,checkpoint,provider_result&order=id&limit=100&offset=' + str(offset), key)
        for job in jobs:
            if not job.get('provider_result'):
                continue
            provider = normalize_provider(job['provider_result'])
            if not provider['matchedSources']:
                continue
            rows = supabase_request('/rest/v1/submissionTable?id=eq.' + job['submission_id']
                + '&select=id,transcribed_text,scan_result', key)
            if not rows:
                continue
            saved = supabase_request('/rest/v1/submission_match_evidence?job_id=eq.' + job['id'] + '&select=artifact,data', key)
            artifacts = {item['artifact']: item['data'] for item in saved}
            row, state = verified_status(rows[0], job, artifacts)
            report = row.get('scan_result') or {}
            tasks = BackgroundTasks()
            if args.recover and state['state'] == 'ready' and not report.get('stale') and report.get('evidenceStatus') != 'ready':
                queue_missing_evidence(job, provider['matchedSources'], tasks)
                asyncio.run(tasks())
            sources = report.get('matchedSources') or []
            print(json.dumps({'submission_id': row['id'], 'scan_id': report.get('scanId'), 'score': report.get('score'),
                'source_ids': [s.get('id') for s in sources], 'artifact_count': len(saved),
                'stored_ranges': sum(len(a.get('ranges', [])) for a in artifacts.values()),
                'matching_fragments': sum(len(s.get('matching_fragments', [])) for s in sources),
                'evidence_status': report.get('evidenceStatus'), 'exports_claimed': len(tasks.tasks),
                'provider_text_equals_display': artifacts.get('crawled', {}).get('text') == row.get('transcribed_text')}), flush=True)
            reports.append(row)
        if len(jobs) < 100:
            break
        offset += len(jobs)
    if args.reports:
        args.reports.write_text(json.dumps(reports), encoding='utf-8')


if __name__ == '__main__':
    main()
