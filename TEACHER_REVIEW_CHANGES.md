Teacher Classwork and submission review implementation report

The subsequent matched-text highlighting fix is documented in [HIGHLIGHTING_FIX.md](HIGHLIGHTING_FIX.md). It supersedes the highlighting/storage limitations below and adds the required `submission_match_evidence.sql` migration.

1. Files changed: `src/pages/TeacherDashboard.js`; `src/pages/dashboard/SubmissionReview.js`, `ClassmateMatches.js`, `SimilarityPreview.js`, `similarityEvidence.js`, `rosterSort.js`, `gradeExport.js`; `src/workspace-theme.css`; `backend/submission_checker.py`, `backend/submission_status.py`; `submission_teacher_edit.sql`. Tests changed/added: `SubmissionReview.test.js`, `SimilarityPreview.test.js`, `similarityEvidence.test.js`, `gradeExport.test.js`, `backend/test_submission_checker.py`, `backend/test_submission_status.py`, and `scripts/test-revisions.cjs`.

2. Online preview: compact clickable badge showing the saved percentage, Checking, Failed, Not checked, or Previous transcription. A real zero remains 0%. Classroom-only reports are not presented as online results. Badges open the existing review dialog.

3. Peer preview: shows the highest valid saved match and match count. Each referenced submission must exist in the current authorized dataset, share classroom and assignment, and belong to a different student. Duplicate, stale, out-of-scope and invalid matches are excluded.

4. Previews use the existing batched teacher status/results loading. Rendering badges performs no API calls or scans. The main review uses these stored peer matches; explicit Inspect retains the existing detailed pair comparison.

5. Student sorting: shared case-insensitive last-name comparator, first-name secondary ordering, stable ties, applied before pagination to both teacher rosters. People already uses this shared comparator. The current profile queries/schema use full_name; fallback supports comma-formatted names, compound surnames and suffixes. Structured first/last fields take precedence when present. Stored names are not modified.

6. Highlighting disappeared because the review rendered the canonical text in an always-editable textarea instead of a highlight renderer. The older manual-scan highlighter also inferred matches from source-title word overlap. The restored review display uses exact evidence and does not use that heuristic. Unrelated manual-scan UI remains unchanged.

7. Online highlights use a solid underline; peer highlights use a dotted underline/outline. A legend and passage titles identify the types. Overlap is split into flat text segments with titles listing both types, preserving whitespace and avoiding nested highlights.

8. Exact evidence: supplied matching text, valid character ranges in matching fragments, supplied highlighted passages, and the existing peer consecutive-word matcher. Provider normalization preserves supplied matched_text and matching_fragments. Source titles and general source snippets never generate highlights. When no reliable passage can be located, the review explicitly reports that exact passages are unavailable. It does not fetch additional provider evidence or invent locations.

9. Edit Student Work: teacher-only action switches the single primary essay display into a textarea. Save persists corrections; Cancel restores saved text. Failed saves retain the draft. Blank edits are rejected. Successful saves show “Extracted student work updated successfully.”

10. Canonical field: public."submissionTable".transcribed_text, represented as transcribedText in the dashboard. The original uploaded file, student identity, assignment, submission timestamp and grade are preserved.

11. Saving changed text marks the existing scan_result stale and clears the numeric plagiarism_score cache. No scan is queued on save. Previous percentages/highlights are hidden from the current-text review. Re-run Similarity Check uses the existing explicit processing RPC. The existing release trigger makes corrected results private again, and report verification rejects stale reports until a new check completes.

12. Authorization: edit_submission_transcription checks can_access_submission(submission_key, true), which follows the existing classroom-teacher authorization. Students and unrelated teachers are rejected in PostgreSQL. Row/job locks prevent edits during processing; expected_text rejects stale concurrent saves. Existing submission identity protections remain in effect. No new administrator editing permission is introduced.

13. Excel columns, in order: Subject | Assignment | Student Name | Grade. One worksheet, frozen header, filter, readable widths, valid XLSX serialization.

14. Excel groups rows by assignment while preserving assignment group order, then sorts students by last and first name. Names are formatted Last Name, First Name. Existing assignment/classroom scope checks and latest-submission selection remain. Blank grades remain blank and numeric zero remains zero.

15. Removed workbook fields: account ID, class, section, submitted/due/returned timestamps, status, submission timing and feedback. Removed the Export details sheet. No technical fields or hidden technical columns are emitted.

16. Responsive behavior: badges wrap, existing student rows stack on small screens, and the review retains its single-column/mobile and main-content/grading-panel desktop layout. No fixed-width columns were added.

17. Theme behavior: badges and marks use shared workspace/theme variables, with light-mode fallback values. The existing textarea/grading dark-mode rules remain. Match type is also conveyed through underline style and text labels.

18. Tests cover stored preview states, strongest scoped peer match, opening review, exact passages, overlap, whitespace preservation, no guessed highlights, read-only default, Edit/Cancel/Save, stale evidence suppression, XLSX round-trip/sorting/zero/blank grades, provider evidence preservation and stale status verification. SQL tests cover teacher/student authorization, stale concurrent edits, processing locks, original-file and grade preservation, stale report rejection and migration repeatability.

19. Results: 53 focused frontend tests passed across eight suites; the final evidence/peer-detail follow-up passed all 13 tests. All 49 selected backend tests passed. The SQL revision/edit integration suite passed. Production build succeeded with lint warnings. A broader frontend run reported 228 passing and three failures in PasswordReset.test.js (profile update expectations), outside the changed workflow. No live Supabase/provider or visual browser verification was performed.

20. Deployment: apply submission_teacher_edit.sql after the existing submission revisions/provenance migrations, then deploy the updated backend/frontend. This migration adds an authorized RPC and updates stale-report verification; no columns are added. It has only been executed against the local PGlite test database, not live Supabase. Reapplying older provenance SQL later would replace the stale-report verification function, so reapply this migration afterward. No new HTTP endpoint or external dependency is required. Optional similarity filters were not added; existing filters, pagination and classroom/assignment context remain.
