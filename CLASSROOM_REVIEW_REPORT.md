# Classroom context and teacher review update

## Student classroom context

Previously, `selectedClassroomId`, `openedClassroomId`, and the draft assignment were independent. Some entry points selected a classroom first, while opening a draft itself only recorded the origin and assignment. The generic assignment heading did not identify its current classroom. Assignment ID and origin also lived only in React state, so refreshing lost them.

Opening an assignment now selects its classroom and the assignment page together. Classroom-detail navigation passes its explicit classroom ID; it is used when it matches the assignment's actual membership. A conflicting ID cannot override the assignment's `classroomId`. The top of the assignment view displays the classroom and section, followed by the assignment title. No classroom data is sorted or defaulted to the first row.

The existing session-storage approach now also stores a user-scoped navigation record containing assignment ID, classroom ID, and origin. It stores no essay, file, grade, or credential data. On refresh, the assignment is recovered from freshly loaded authorized data. Missing or inaccessible assignments are cleared. Storage failures leave normal in-session navigation working.

Back from a classroom-origin assignment names and returns to that classroom. To-do, Calendar, and Results retain their origin and previous classroom filter. Unavailable origins safely fall back to To-do. If saved classroom origin conflicts with assignment membership, Back uses the actual assignment classroom. Leaving the assignment clears its stored navigation record.

## Canonical essay and previous duplication

The teacher review previously displayed the full text in three places:

1. `HighlightedText` inside the large detection-result card.
2. The saved-transcription correction textarea.
3. Document fallback previews or the multi-page preview's Complete Essay section, with additional per-page text.

The canonical saved field remains `submission.transcribedText`, normalized from `transcribed_text`. Existing legacy scan-result fallback behavior is retained on opening a review. `reviewTranscribedText` is its editable review draft. It now appears once in the primary **Extracted Essay** editor, preserving line breaks and paragraphs. Copy Text uses that same draft. Corrections still require the existing recheck before saving or returning a grade; no OCR, similarity, or storage fields were removed.

Similarity details display supplied sources, matched-word counts, relevant excerpts, provider information, summary, and flags, without rendering the full essay again. Full-text duplicates in excerpt/summary fields are suppressed. No new heuristic matches are invented. Missing scores display an unavailable/pending state; a genuine supplied zero remains 0%. Processing failures show their actual error and the existing retry action.

## Review structure

- Compact header: Back to submissions, student, assignment, classroom/section/subject, submission status, and date.
- Left: Submitted Work, ordered original pages/files, one Extracted Essay, compact Similarity Analysis with collapsed details, and compact Peer Similarity.
- Right: Grading, grade presets/input, feedback, save status/errors, revision history/request, Save Grade, and Return work.
- Below: collapsed class/private comments using the existing comment mechanism and permission checks.

Image enlargement and original downloads remain available. Multi-page review previews use explicit page numbers. Their optional **View page-by-page extraction** is collapsed by default and does not add another Complete Essay. Other preview consumers retain their previous behavior. Peer inspection uses the existing scoped comparison dialog and pagination, without automatically exposing full peer essays.

The new presentation component receives the existing review state and actions from `TeacherDashboard`; it does not introduce another submission lifecycle or repeat OCR/similarity requests. Only one comments component is active for the assignment while reviewing.

## Grading, responsiveness, and themes

Grade and feedback stay in the parent state while disclosures open or close. Failed saves preserve both inputs and show the returned error. An immediate in-flight guard prevents duplicate saves, and saving controls are disabled. Successful saves and return actions retain their existing API/RPC flow. Background processing updates do not overwrite an independently edited transcription draft.

At desktop widths the workspace uses approximately 63% Student Work / 37% Grading. The right panel is sticky within the scrollable review, with its own maximum height for long grading content. Below the desktop breakpoint, it becomes a normal single-column flow after Student Work. Long essay text and source URLs wrap. The existing homepage/workspace CSS tokens and generated utility mappings supply light/dark colors; there is no new palette.

## Files changed

- `src/pages/StudentDashboard.js`
- `src/pages/StudentDashboard.workspace.test.js`
- `src/pages/TeacherDashboard.js`
- `src/pages/TeacherDashboard.workspace.test.js`
- `src/pages/dashboard/SubmissionReview.js` (new)
- `src/pages/dashboard/SubmissionReview.test.js` (new)
- `src/pages/dashboard/SubmissionFilePreview.js`
- `src/pages/dashboard/EssayBundlePreview.js`
- `src/pages/dashboard/EssayBundlePreview.test.js`
- `src/pages/dashboard/ClassmateMatches.js`
- `src/pages/dashboard/ClassmateMatches.test.js`
- `src/workspace-theme.css` (regenerated)
- `scripts/test-review-layout.cjs` (new)
- `CLASSROOM_REVIEW_REPORT.md`

## Verification

**61 tests passed across 9 frontend suites.** Coverage includes classroom-origin and stale-context recovery after refresh, Back destinations, existing submission uploads, one canonical essay, pending/failed/zero-score states, ordered originals and collapsed page text, scoped peer inspection, comments, duplicate grade-save prevention, retained drafts after errors, saved grade/feedback on remount, return-work, and revision requests.

The new headless Edge check renders the actual review component with inert data adapters and production CSS. It verified two columns with sticky grading at a 1256px content viewport, one column with static grading at 516px, no horizontal overflow with long URLs, shared dark colors, and restoration of light colors. The existing 14 browser palette checks also passed.

The final production build passed with existing lint warnings. `git diff --check` passed.

No API contract or database changes are required, and there is **no migration** for this update. The automated persistence checks mock backend responses; live authenticated grading, comments, and OCR-provider runs were not performed.
