# Multi-page essays and required registration fields

## Behavior and configuration

- Default limits: **10 MiB per image, 50 MiB total per essay, 20 pages**. Configure `MAX_IMAGE_SIZE_MB`, `MAX_SUBMISSION_SIZE_MB`, and `MAX_ESSAY_PAGES` in `backend/.env`; see `backend/.env.upload.example`. The UI obtains these limits from `/api/upload-limits`. Backend validation remains authoritative. Existing non-image document handling keeps its 25 MiB limit.
- Supported handwritten page types: JPEG, PNG, WEBP, BMP, and single-frame TIFF. The backend verifies actual image contents, rejects unreadable/multiframe images and decompression bombs, and enforces individual and combined sizes before starting batch OCR. Renaming an unsupported file does not make it a valid image.
- Students and teachers see numbered thumbnails with Add, Remove, Replace, Move Up, and Move Down controls. Multi-page student OCR starts only after clicking **Transcribe pages**. Reordering or replacing pages invalidates the assembled transcript. Existing single-image transcription still works.
- Page order is always explicit (`page_number`, starting at 1), following the preview/multipart order. Filenames and completion times do not control it. The batch endpoint invokes the **same single-page preprocessing → YOLO → TrOCR generator** in page order. Result assembly also sorts by page number and rejects missing/duplicate numbers.
- Within a page, YOLO boxes are grouped top to bottom. Near-aligned fragments (centroids within 35% of the smaller line height) are read left to right before TrOCR. Existing duplicate suppression, preprocessing, and opt-in split-line repair remain.
- Recognized text keeps its words, case, and punctuation. Formatting now changes whitespace only: same-row fragments use a space, successive writing lines use newlines, and unusually large vertical gaps infer paragraph breaks. Pages join with one newline, so a page turn does not automatically create a new paragraph. OCR accuracy still depends on the image and model; students can review/correct each page.
- Progress identifies **Page X of Y**, detection, transcription/line counts, combining, then similarity checking. A failed, blank, truncated, or disconnected page stream never produces a completed essay. Errors identify the failing page; retry processes the selected essay again. The implementation does not silently omit a failed page or scan partial text.
- Page editors produce the displayed **Complete Essay** used for saving and similarity. Teacher manual checks send this text once, without filename headings or duplicate transcript blocks. Student submission uses the existing reviewed-text save and one queued similarity job after all pages succeed.

## Storage, ownership, and history

Multi-page originals are stored as one immutable `.essay.zip` under the existing `backend/uploads/submissions/<student>/<assignment>/` directory. It contains the original image bytes and `manifest.json` with explicit page numbers, image entry references, filenames, per-page reviewed text, `ready` status, owner, assignment, and combined text. The existing submission row's `file_url` links all pages to its `submission_id`; no separate page rows or second submission lifecycle are introduced.

The archive exists before the existing submission insert/revision RPC queues processing. Intake verifies ownership, image limits/content, complete page status, and equality between the submitted essay text and the ordered page texts. Page downloads use the existing exact-file authorization, including revision-history permissions. Saved originals remain viewable after lowering future-upload limits. Teacher-authorized text corrections retain the existing recheck behavior.

**Keep `backend/uploads` on persistent storage and include it in backups**, as with the existing local upload fallback. Multi-page archives currently use this backend storage, rather than Supabase Storage. No SQL migration is needed for multi-page essays. Restart the full backend (`npm run start:backend`, not the Contact Us-only development server) to load the new endpoints.

## Registration

Full name, email, password, confirm-password, and the selected student/teacher role must be present. Whitespace-only fields are rejected; the Create Account button remains disabled while fields are missing. The submit handler repeats the check, so bypassing browser-required validation does not call Auth. Existing institutional-domain, password length/matching, duplicate-account, email confirmation, and approval behavior remain.

Apply **`registration_required_fields.sql`** in the Supabase SQL editor after the existing registration migrations. It independently rejects missing name/email/role metadata for new Auth accounts; existing accounts are unchanged. Supabase Auth owns password validation; confirm-password remains client-side and is never stored. This migration has been tested locally but **has not been applied to your live Supabase project**.

## Files changed for this request

| Area | Files |
| --- | --- |
| Backend pipeline and storage | `backend/main.py`, `backend/essay_pages.py`, `backend/ocr_regions.py`, `backend/submission_access.py`, `backend/submission_intake.py`, `backend/submission_worker.py`, `backend/.env.upload.example` |
| Student and teacher UI | `src/pages/StudentDashboard.js`, `src/pages/TeacherDashboard.js` |
| Shared upload/OCR/preview components | `src/pages/dashboard/essayPages.js`, `EssayPagePicker.js`, `EssayBundlePreview.js`, `ocrService.js`, `useSubmissionTranscription.js`, `SubmissionTranscription.js`, `SubmissionFilePreview.js` |
| Registration | `src/pages/AuthModal.js`, `registration_required_fields.sql` |
| Tests | `backend/test_essay_pages.py`, `backend/test_submission_intake.py`, `src/pages/StudentDashboard.submission.test.js`, `src/pages/TeacherDashboard.workspace.test.js`, `src/pages/AuthModal.test.js`, `src/pages/dashboard/essayPages.test.js`, `EssayBundlePreview.test.js`, `useSubmissionTranscription.test.js`, `scripts/test-registration-required.cjs` |
| Report | `MULTIPAGE_UPLOAD_REPORT.md` |

Pre-existing navigation, SMTP, and student similarity changes were preserved.

## Verification

- **73 frontend tests passed across 9 suites**, including three-page reorder → review → one submission, teacher one-complete-essay scanning, failure preventing similarity, ordered saved-page previews, the existing single-page path, and required registration fields.
- **55 backend tests passed** across page upload/OCR streaming, submission intake, worker processing, line regions, and access-control suites. The tests cover invalid contents, per-image/aggregate limits, failed pages, reordered results, paragraph continuity, original reconstruction, ownership, and exactly one combined-essay checker call.
- **7 registration SQL checks passed** in isolated PGlite, including repeated application of the migration.
- Python compilation and `git diff --check` passed.
- Production build (`npm run build`) passed with existing lint warnings.

These checks mock model/provider output where appropriate. A live authenticated upload of real handwritten pages and a real similarity-provider run have **not** been performed. After restarting, manually verify a one-page essay and a reordered three-page essay, inspect each saved page and Complete Essay, then check the single combined similarity result. Also try an oversized image, an oversized batch, and an unreadable middle page. Live registration enforcement requires applying the SQL above.
