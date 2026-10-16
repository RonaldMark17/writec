# Student submitted-work review

Implemented in the existing React application. No backend or database changes.

## Files and components

- `src/pages/StudentDashboard.js`: integrates the shared review in the submitted assignment and submission-detail entry points; retains notification opening and current-record refresh; connects resubmission to the existing form; adds safe submission-load wording and retry.
- `src/pages/dashboard/StudentSubmissionReview.js`: summary, grade, teacher feedback, permitted resubmission action, current files, submission details, existing revision history, student-safe similarity and comments.
- `src/pages/dashboard/StudentReviewDialog.js`: accessible review/lightbox dialog, focus containment, Escape, focus restoration and scroll locking.
- `src/pages/dashboard/SubmittedImageGallery.js`: numbered original-page gallery, downloads and larger in-place preview with previous/next navigation.
- `src/pages/dashboard/SubmissionFilePreview.js` and `EssayBundlePreview.js`: opt-in student presentation, authenticated downloads, empty/loading states and retryable errors. Existing teacher preview presentation remains available.
- `src/pages/dashboard/studentSubmission.css`: responsive layout, theme colors, focus outlines and touch targets.
- `StudentSubmissionReview.test.js`, `SubmissionFilePreview.test.js`, and `StudentDashboard.workspace.test.js`: new workflow coverage and updated expectations for the new hierarchy.

## Information hierarchy and behavior

1. Assignment title, explicit status, submitted timestamp, essay title and class.
2. Released grade prominently displayed in its original grading format; no invented denominator. Ungraded work says “Awaiting teacher review.” Zero grades remain visible.
3. Teacher feedback displayed immediately. Revision instructions take priority and are never hidden behind a disclosure.
4. One “Resubmit Work” primary action when the existing revision/failed-processing rules permit it and the class is active. It opens the existing submission form. Archived classes have no review CTA.
5. “Your Submission” shows the latest original files, filenames and ordered page numbers, with secondary download links.
6. Submission details, stored revision history with earlier originals, existing student-safe similarity results, and class/private comments. The assignment view keeps its existing comments below the review rather than duplicating them.

Status uses text plus blue for Submitted/Resubmitted, green for Returned, and amber for Resubmission Requested. Unreleased grades/feedback remain hidden. Completed revision records establish Resubmitted; returned current grades take precedence. Earlier files are kept under history and do not replace the current attempt.

The student review no longer displays the processing pipeline or YOLO/TrOCR model labels. Similarity continues through the existing student-safe endpoint, with its existing neutral language and permissions.

## Files, responsive design and accessibility

Multi-image pages sort by stored page number and render in two columns when space permits, one on phones. Images retain aspect ratio. The lightbox stays in-page, has an accessible title and close control, and offers previous/next controls. Keyboard focus is contained and restored to the trigger; Escape closes the active dialog. Semantic buttons, image alt text, visible focus outlines, wrapping filenames and approximately 44px controls are included.

Light and dark mode have explicit readable card, text, grade and status colors. Loading files, no files and failed retrieval have explicit states; file errors offer Try Again without raw API errors.

## Verification

- 67 tests passed across 6 suites: StudentSubmissionReview, StudentDashboard.workspace, StudentDashboard.submission, SubmissionFilePreview, StudentSimilarity and SubmissionReview.
- Covers first submission, graded first submission, resubmission requested, completed resubmission, graded resubmission including zero, current-file replacement, unreleased-grade privacy, revision form navigation, archived-class restriction, notification opening, comments, multi-page ordering/navigation, focus restoration, file retry and empty files.
- Browser fixture audit: 98 checks, zero reported layout issues. Viewports: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768, plus 1920×1080, all in light and dark mode. Checked horizontal overflow, dialog fit and mobile button sizing. Representative screenshots inspected.
- Production build passes with existing lint warnings in App, Dashboard, StudentDashboard and TeacherDashboard; no warnings in the added components.
- `git diff --check` passes.

First-submission and resubmission review paths are confirmed by automated component/integration tests. Browser checks use rendered fixtures with mocked services and sample image placeholders; they are not an authenticated live-backend submission/teacher-grading test or physical-phone test.

Evidence: `student-review-verified-tests.log`, `student-review-build.log`, `student-review-browser.log`, and `artifacts/student-review-audit/results.json` (screenshots in the same directory).
