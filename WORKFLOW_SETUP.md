# Automatic submission workflow

Apply `submission_processing.sql` in the Supabase SQL Editor after the existing
`submission_security.sql` and `submission_release.sql`. The migration is repeatable.
New submissions enqueue in the same transaction as the submission insert. Existing
submissions are left alone; the classroom teacher can queue them from the review window.

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

Supported automatic extraction: UTF-8 text, DOCX, images, and PDFs. Image-only PDF
pages use OCR on embedded images. Complex page layouts may need transcription corrections.
Legacy DOC/RTF formats fail explicitly; convert them to DOCX/PDF/TXT before submitting.

## Verification

The OCR API repairs adjacent YOLO boxes only when handwriting components cross
their shared boundary. TrOCR compares original and contrast-enhanced line crops.
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
