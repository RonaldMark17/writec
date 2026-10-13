# Generic Copyleaks evidence pipeline verification

The local implementation now retrieves and renders evidence for arbitrary completed scans. Eight existing incomplete reports were recovered through real signed Export API callbacks, and one completely new text-file submission automatically obtained evidence before its first Teacher review request. No report layout or CSS was changed for this follow-up. The AWS application still needs deployment; this is not a claim that the deployed Teacher website has been updated.

## First broken stage and comparison

The old example already had persisted detailed evidence. The recent nine-source 100% report had provider source IDs and a summary, but no evidence artifacts or export checkpoint. Its first missing stage was detailed evidence retrieval, before attachment or rendering. A separate 77.2% report had a requested export checkpoint but no artifacts. The previous recovery condition skipped every existing checkpoint permanently, including failed or abandoned requests.

The public AWS evidence route also returned HTTP 401 `Sign in to continue.` from the old account guard, before callback signature validation. The updated local route allows evidence POSTs through the guard, rejects unsigned requests, validates the signed scan/source/job association, and accepts real provider callbacks. Historical callback arrival cannot be established from a missing database row alone; the public middleware rejection was reproduced directly.

| Case | Submission ID | Scan ID | Score | Sources | Before: ranges | After: ranges / rendered marks |
|---|---|---|---:|---:|---:|---:|
| Old working | 628eb0b7-0045-5426-a26a-1af8c048fd47 | jc55e38b0ed1c4651968811e89dc78ba5 | 75.2% | 1 | 25 | 25 / 25 |
| Recent broken | 25bbf679-c6f7-5999-92ff-033156e32114 | j6f15ad933b224d3da4f2f649a73546d1 | 100% | 9 | 0 | 25 / 8 |
| Fresh upload | 8e7f495d-4c0b-59c7-adb3-a148e0825990 | j914ae224b1514a03a1fc6051dc77cf27 | 100% | 30 | Not yet created | 181 / 55 |

Old source ID: `1c7886b81f`. Recent 100% source IDs: `0c9fd1de9f`, `10408a11de`, `2b5905d3d4`, `3c89e0c232`, `428f39bd0e`, `6d8b7802c0`, `a61ab77302`, `a6764a70ea`, `da0b344aa9`. The read-only audit script reports all current source IDs, including the fresh upload's 30 IDs, without student names or essay text.

All three now have stored evidence, projected `matchedSources[].matching_fragments`, ranges returned by `collectEvidence()`, and visible `mark.essay-match` elements. Mark counts differ from range counts because overlapping sources are split into nonoverlapping text segments while retaining their source associations. Before recovery the recent report had no fragments or marks. The raw saved summary does not need to duplicate fragments: `/api/submissions/status` attaches the separately stored artifacts when producing the review report.

## Implementation

- `backend/submission_checker.py`: the normal completed-scan path saves an export checkpoint before requesting every supported source. New submissions do not depend on opening Teacher review to start export. Removed the hardcoded callback-host fallback.
- `backend/match_evidence.py`: generic lazy recovery uses a conditional database claim matching the prior checkpoint and timestamp. Requested/failed exports become eligible after five minutes, with at most three attempts. Concurrent opens cannot claim the same attempt. Ready evidence never re-exports. Recovery invokes export only, never submits another plagiarism scan. A failed older request cannot overwrite a newer claim. Callback logs include scan, artifact, submission and compact range count, without text or secrets.
- `backend/copyleaks_service.py`: callback configuration requires a public HTTPS host and rejects localhost. Export uses unique export IDs, crawled text and every supported source ID, following the [Copyleaks Export contract](https://docs.copyleaks.com/reference/actions/downloads/export/).
- `backend/submission_status.py`: summary readiness and evidence readiness remain separate. A retry is pending rather than permanently unavailable. Legacy reports missing a canonical text binding receive it only when provider crawled text exactly equals the current transcription. Existing stale bindings are not overwritten.
- `src/pages/dashboard/SubmissionReview.js`: pending reports display `Loading matching passages...`. Existing dashboard status polling updates the open review when evidence arrives. Empty pending results are not treated as permanently ready.
- Regression changes: `backend/test_match_evidence.py`, `backend/test_submission_checker.py`, `backend/test_submission_status.py`, and `src/pages/dashboard/SubmissionReview.test.js`.
- New verification tools: `scripts/audit-copyleaks-evidence.py` and `scripts/test-copyleaks-live-reports.cjs`.

The existing student-side UTF-16 extraction for identical, minorChanges and relatedMeaning is preserved. No suspected-document coordinates or score-derived ranges are used. All 11 verified reports had exact provider/display text equality. Production highlighting has no example ID, score, URL or fixture fallback. Historical fixtures remain test-only. No database migration was required for this follow-up; the existing evidence table and save-artifact RPC were used.

## Actual verification

The recent 100% report was recovered through one generic export request. Signed callbacks populated crawled text plus all nine source artifacts, producing 25 saved ranges. The production status projection returned those 25 fragments and the actual report components rendered eight yellow segments. Sources/Plain switching, all contributing source links, text preservation, pending-to-ready updates and remount/reload passed in light and dark themes.

Other verified reports covered 42.5% (two sources, 26 ranges), 47.7% (one source, one range), 77.2% (24 ranges), additional 75.2% reports, and 100% reports with one, six and ten sources (7, 11 and 27 ranges respectively). Eleven distinct reports were checked, with no evidence crossing between submissions. These existing records used real database rows through the production status projection; no personal Student account or authenticated AWS Teacher session was used.

The fresh test used isolated Teacher/Student accounts, Supabase Storage upload, an authenticated Student submission API request, the real job claim/worker and normal provider completion/export paths. A temporary public tunnel delivered real summary and signed detailed callbacks to the local backend. The upload was a public-domain text document: it exercised document text extraction, not handwritten-image OCR. It consumed exactly one new scan credit and no second scan. All 181 ranges were stored before the first Teacher review request. Two authenticated local Teacher status requests returned ready evidence, and the export checkpoint remained unchanged. The test submission/evidence is retained for audit; test accounts are disabled and its classroom archived after verification.

The browser harness renders the real SubmissionReview/EssayEvidence components with real saved reports and production CSS; unrelated comments/file-preview adapters are stubbed. It does not submit scans. All 11 reports passed both themes, correct source links, score display, canonical text preservation, Sources/Plain, pending-to-ready and reload. Screenshots show the fresh 30-source result: [light](artifacts/copyleaks-general/light.png), [dark](artifacts/copyleaks-general/dark.png). Metadata-only outcomes are stored beside them.

Automated regression results: **67 backend tests passed** across evidence, status, checker, account guard and worker; **57 frontend tests passed** across review, renderer, evidence builder, progress and Teacher workspace. Coverage includes arbitrary IDs and 5%/100% scores, all-source exports, callback persistence/security, multiple submissions, atomic recovery, bounded stale-request retries, ready-evidence no-export, canonical text safety and automatic pending-to-ready rendering. The production build succeeded with existing lint warnings, and `git diff --check` passed. Both-theme browser verification was repeated successfully against the final production CSS build.

## Deployment and reproduction

The AWS operator must deploy the updated backend (including account guard, worker, status and evidence modules) and frontend. `COPYLEAKS_WEBHOOK_BASE_URL` controls the public callback base; `COPYLEAKS_WEBHOOK_URL` is the existing fallback. Use a publicly reachable HTTPS backend that serves the updated routes. Localhost cannot receive Copyleaks callbacks. The temporary verification tunnel is not a permanent callback configuration and no `.env` file was changed.

After deployment, confirm signed evidence callbacks reach `/api/plagiarism/evidence/{scan_id}/{artifact}` and unsigned requests are rejected by the handler. Old summary-only records can recover through status polling; failed/stuck exports have bounded retries, not unlimited rescans. Records exhausting the retry limit require operational investigation.

Read-only audit (IDs and counts only):

```powershell
python scripts/audit-copyleaks-evidence.py
```

Optional `--recover` requests eligible exports using the configured public callback host. It never starts a new plagiarism scan. Optional `--reports PATH` writes private essay-bearing report JSON for local browser verification; keep this file out of source control.

```powershell
npm run build
node scripts/test-copyleaks-live-reports.cjs PATH_TO_PRIVATE_REPORTS_JSON
```

The live-report browser command requires explicitly supplied reports; it has no fixture fallback. Deployment verification on AWS and a fresh handwritten-image OCR upload remain outside the completed local text-upload verification.
