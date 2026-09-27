# Automatic submission workflow

Apply `submission_processing.sql` in the Supabase SQL Editor after the existing
`submission_security.sql` and `submission_release.sql`. The migration is repeatable.
Apply `submission_provenance.sql` last, after `submission_processing.sql`, including
when older migrations are rerun. It validates provider scan identity and score at
return time and hides already-returned unverified results from students. Deploy the
updated backend and frontend together; see `IMPLEMENTATION_COMPLETION_REPORT.md`.

New submissions enqueue in the same transaction as the submission insert. Existing
submissions are left alone; the classroom teacher can queue them from the review window.

## Student review, save, and API check

### Local API readiness

The local teacher dashboard reads `/api/submissions/status`, which checks a report
against the stored Copyleaks callback and its scan ID. A ready flag or cached score
alone is not sufficient evidence. It shows a credit warning when the account has
zero credits, and preserves the original file and essay when a check fails.

Localhost and the deployed backend currently share the Supabase queue. An older
deployed worker can claim locally submitted jobs and write legacy fallback results.
For reliable local acceptance testing, use a separate Supabase development project
with the migrations applied, or stop the deployed queue worker for the test. A
public HTTPS callback must deliver to a backend using that same development database.
Do not interpret cached fallback reports as successful Copyleaks responses.

1. A student selects Picture or File. Images stream YOLO–TrOCR text and line progress;
   PDF/DOCX/text files show their extracted text. Nothing is submitted for grading yet.
2. The student reviews or corrects the text. Submit is disabled while transcription
   is incomplete or failed. Replacing a file cancels its preview and discards stale text.
3. Submit uploads the original and calls `POST /api/submissions/submit`. The backend
   verifies the enrolled student, assignment, upload ownership and deadline, then saves
   the original file reference and reviewed text together. A stable submission ID makes
   retries idempotent. Client-supplied grades or API results are rejected.
4. The existing database trigger queues the API check in that same transaction. The
   worker uses the saved reviewed text, so it does not repeat OCR for these submissions.
5. The teacher can see the original and saved essay immediately. Copyleaks results and
   source links appear after its authenticated completion callback. A provider failure
   leaves the saved work visible and offers retry; it does not create a zero-score result.

This flow uses the existing submission and job schema; no additional migration is
required when `submission_processing.sql` is already installed. The separate legacy
manual plagiarism endpoint is not used by this flow.

Install backend dependencies with `python -m pip install -r backend/requirements.txt`.
Set these variables in **backend/.env only**:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<server-only Supabase service-role key>
SUBMISSION_SIMILARITY_MODE=copyleaks
COPYLEAKS_EMAIL=<your account email>
COPYLEAKS_API_KEY=<your API key>
COPYLEAKS_SANDBOX=false
COPYLEAKS_WEBHOOK_BASE_URL=https://<public-backend-host>
```

`SUPABASE_SERVICE_ROLE_KEY` accepts a Supabase secret API key (`sb_secret_...`)
or a legacy service-role JWT. Keep it in the ignored `backend/.env` file and
restart the backend after changing it. Publishable keys cannot run the worker.

Use `SUBMISSION_SIMILARITY_MODE=classroom` to run only classroom comparisons without
an external scan. Reports explicitly state that internet sources were not checked.
Real Copyleaks checks require configured credentials, credits and a reachable HTTPS
webhook. Sandbox results are deliberately rejected for submission grading.

Copyleaks is enabled by default. `COPYLEAKS_WEBHOOK_URL=http://localhost:8000`
does not satisfy the automatic worker's callback requirement. Set
`COPYLEAKS_WEBHOOK_BASE_URL=https://<your-backend-domain>` and restart the backend.
New saved submissions then run automatically. Existing failed jobs can be retried from
the teacher review window after configuration is fixed; they are not silently
reported as completed or converted into classroom-only checks.

Install JavaScript dependencies with `npm install`, then run `npm start` to start
both the frontend and backend. To run them separately, use `npm run start:backend`
and `npm run start:frontend` in separate terminals.
Jobs are processed in a backend worker thread. A crashed worker's lease expires after
two minutes; a restarted worker resumes the same job. OCR text and provider results
are checkpointed in Supabase. Network retries reuse the same external scan ID; corrections
and retries after a confirmed provider failure create a new check ID. Original upload files must remain available to every backend
worker; use Supabase Storage for multiple backend hosts. The local upload fallback
requires persistent disk on the backend host.

The database job table is inaccessible to browser accounts. Students receive safe
metadata and processing state immediately; result fields are masked until return.
They can continue to open their original upload. Teacher review supports transcription
corrections, rechecking, saving drafts, and returning. Checks must finish before return.
Corrections must be rechecked before saving a grade through the review interface.
Classroom comparison covers other submissions with saved transcriptions at check time;
teachers can recheck after later submissions finish processing.

The teacher upload station's **View submission & result** action opens the original
student document and its saved automatic report. It does not create another scan.
The dashboard discovers newly submitted work and updates processing results every
five seconds while visible. Student and teacher views support image, PDF, and plain
text previews; DOCX retains the original download and shows extracted text once ready.
Unrelated manual checks are never used as a student's saved report.

Manual PDF/DOCX checks also use the authenticated `/api/documents/extract` endpoint
so plagiarism checking receives document text. Image-only PDFs use the OCR pipeline.

Supported automatic extraction: UTF-8 text, DOCX, images, and PDFs. Image-only PDF
pages use OCR on embedded images; mixed pages now read embedded images alongside
selectable text. Complex page layouts may need transcription corrections.
Legacy DOC/RTF formats fail explicitly; convert them to DOCX/PDF/TXT before submitting.

See [medium-priority setup](MEDIUM_PRIORITY_SETUP.md) for cross-device profile
preferences, automatic-check thresholds and peer controls, live service status,
and the optional SMTP notification dispatcher.

## Verification

The OCR API keeps individual YOLO lines separate by default; experimental merging
requires `OCR_JOIN_SPLIT_LINES=1`. TrOCR compares original and contrast-enhanced line crops.
Disagreement or low token likelihood marks a line for review; these scores are
not calibrated accuracy percentages. Formatting does not substitute memorized
sample text. No model weights are retrained by these changes.

For a real-model local check, stop the backend to free memory, then run
`python scripts/check_ocr.py test_internet_sample.jpg --expected-lines 3`.
This checks JSON/stream consistency using real models without running the cloud
worker. Compare the output with the image to assess word accuracy, then restart
the backend with `npm run start:backend`.

```powershell
$env:CI='true'
npm test -- --watchAll=false --runInBand
python -m unittest discover -s backend -p 'test_submission*.py'
# Install @electric-sql/pglite in a temporary directory; point PGLITE_MODULE at it.
node scripts/test_admin_database.cjs
```

The database test uses real PostgreSQL RLS, triggers and functions with two teachers
and two students. It checks private direct reads, release, worker-only access,
duplicate retries, expired leases, stale worker rejection and corrected rechecks.
Worker unit tests cover checkpoint reuse and failure without fabricated results.

Before calling the deployed milestone verified, run this acceptance check using real
student and teacher accounts on your Supabase project:

1. Submit TXT, DOCX, PDF and handwriting samples; confirm success only after save.
2. Close the student's browser immediately. Reopen it and verify the upload and status.
3. Restart the backend during a check. Wait for the lease to expire and verify recovery.
4. Break provider configuration; confirm a failed state, no zero-score success, and retry.
5. Correct a transcription, recheck, save a zero grade and feedback, then return.
6. Before return, attempt direct table/RPC/file requests with the student token and a
   second student's token. Only the owner should retrieve the original file; neither
   student should retrieve private result fields. After return, only the owner sees them.
7. Interrupt a save request and refresh before retrying. Verify no success is displayed
   without confirmation and no original file is deleted on an ambiguous save failure.

These local tests do not establish live OCR accuracy, webhook reachability, provider
credit availability, or the configuration of your deployed Supabase project.

Provider reference: [Copyleaks submit-file and stable scan IDs](https://docs.copyleaks.com/reference/actions/authenticity/submit-file).
PDF extraction reference: [pypdf page text and images](https://pypdf.readthedocs.io/en/stable/modules/PageObject.html).


## Submission & Plagiarism Workflow Specification

### Student Workflow
1. Student uploads their handwritten essay/work (image/photo).
2. Once upload completes, the system automatically processes the image through the **YOLO -> TrOCR** pipeline:
   - **YOLO** detects and extracts handwritten text line bounding boxes.
   - **TrOCR** transcribes the detected handwritten text into digital text.
3. Once transcription completes, the transcribed text is automatically forwarded to the **Plagiarism Detection API** for originality and similarity analysis.
4. The student sees a clear 4-step confirmation status:
   - Work uploaded successfully.
   - Handwritten text transcribed.
   - Transcribed text recorded/processed.
   - Submission gone through plagiarism checking process.
5. Plagiarism API results, similarity percentages, and detailed matches are **strictly hidden from students** (both before and after teacher evaluation/return).
6. Students never need to click a separate "Check Plagiarism" button.

### Teacher Workflow
1. When the teacher opens their workspace and views a student submission, the system automatically displays:
   - Original uploaded image/photo of the handwritten work.
   - Transcribed text generated by YOLO + TrOCR.
   - Plagiarism API results (plagiarism score, word counts, matched sources, peer similarity, sentence highlights).
2. The teacher does **NOT** need to click "Check Plagiarism" to trigger the process. The check has already executed automatically.
3. If a teacher edits or corrects the OCR transcription, an optional "Recheck with corrected text" button is available to recalculate similarity with the updated text.


## Student replacement after processing failure

Apply `student_resubmission.sql` after `submission_provenance.sql`, then deploy the
updated backend/frontend. The student submission list offers **Resubmit failed work**
only for failed, ungraded work. Students choose a replacement file/image or paste
text, review it, and submit. Ownership, enrollment, active account, current failed
job, no saved grade (including zero), no return, open deadline and active classroom
are checked in an atomic database transaction. Queued/processing/ready work cannot
be replaced. A new job ID prevents an older callback from completing the new check.
The existing submission ID is retained; old uploaded files are not deleted.
A provider outage can still cause the new check to fail; resubmission does not bypass
Copyleaks or fabricate results.

The homepage transcription link is removed. `/transcribe` remains a local test tool;
student submission OCR remains available in the signed-in workspace.
