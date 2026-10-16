# Teacher Review & Grade UI improvements

## Implementation
- `src/pages/dashboard/SubmissionReview.js`: added one `openSourceDetails` handler backed by the existing `sourcesOpen` state. View sources, the summary source count, the essay source badge, and the external-source filter all open the existing Sources and peer matches dialog. The peer shortcut opens that same dialog, scrolls to its saved peer section, and moves keyboard focus there.
- `src/pages/dashboard/EssayEvidence.js`: turned the external-source badge into a native button; clarified filters as All highlights, External sources (N), Peer matches, and Plain text. The external-source filter retains its filtering behavior while opening the source dialog. Peer matches appears only when existing evidence contains peer ranges. If those ranges disappear during an update, the active display falls back to All highlights. Existing passage selection, source identity, highlighting, and inspection are retained.
- `src/workspace-components.css`: equal-weight online and peer summary cards, compact typography, responsive stacking, 44px source controls, explicit pointer/hover/focus styles, and workspace palette colors. Desktop essay/grading columns and mobile grading access remain intact.
- `src/workspace-theme.css`: regenerated from the existing theme generator; no separate palette or theme architecture was introduced.
- `src/pages/dashboard/SubmissionReview.test.js`: updated filter names and source-dialog interactions in existing regression tests.
- `src/pages/dashboard/SubmissionReview.controls.test.js`: new coverage for all source triggers, Enter/Space, focus restoration, preserved feedback drafts, saved peer navigation, no-request behavior, availability states, and conditional peer filters.
- `src/pages/dashboard/EssayEvidence.test.js`: added coverage for disappearing peer ranges.

## Audit and data safety
The existing review entry point is SubmissionReview. EssayEvidence owns selected-passage details and display modes; SimilarityDialog supplies the existing portal, close/Escape, focus trap, and restoration. ClassmateMatches accepts the already-loaded scoped peer matches; individual inspection retains PeerComparison. The grading form is passed into SubmissionReview by TeacherDashboard.

Previously, the external-source badge was a span, the source filter only changed display mode, and the peer result was a small supporting statistic. Source controls now converge on one handler/dialog, while online sources and peers have equal visual prominence. Peer availability remains explicit: matches, no reportable matches, disabled, not checked, or awaiting a current check. No aggregate/replacement percentage is calculated for the new summary.

No backend, endpoint, Supabase flow, authentication, or API implementation was changed. No live scans or Copyleaks requests were invoked during implementation or verification. New interaction tests assert that opening all source/peer shortcuts does not call onRecheck, apiFetch, or checkPeerSimilarityViaBackend. Existing explicit recheck and individual inspection actions remain available with their existing behavior.

## Verification
- 64 relevant tests passed: 54 initial focused component tests, one additional filter regression, seven teacher grading/revision workflow tests, and two responsive integration tests.
- Six theme-generation regression checks passed.
- Final `npm run build` passed with existing unrelated lint warnings.
- `git diff --check` passed.
- Browser layout: 168 checks across 12 fixtures and both themes; zero horizontal overflow, modal-fit, or undersized-button findings. Sizes: 360?800, 390?844, 430?932, 768?1024, 1024?768, 1366?768, 1920?1080.
- Browser contrast: 576 viewport/theme/interaction states, 18,752 text checks, zero failures. Includes default, expanded, hover, and focus-visible states.
- Visually inspected the desktop dark summary/evidence view, mobile light summary, and actual mobile dark grading form. Source and passage dialogs were included in browser audits.

Evidence: `artifacts/teacher-review-refinement-layout`, `artifacts/teacher-review-refinement-contrast`, and `teacher-review-*.log`.

Browser fixtures use real rendered components with mocked services; some focused fixtures substitute the grading form, while the teacher-grading integration fixture uses the actual form. Verification does not claim live-account/backend testing or physical mobile-keyboard testing. No known issue introduced by this change remains.
