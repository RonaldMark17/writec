# Submitted Work refinement ? October 16, 2026

## Scope and audit
This pass continues the existing implementation in the working tree. It does not replace the prior redesign, edit SQL/backend behavior, or redesign other roles/pages. The working tree already contained substantial uncommitted changes; those were preserved.

Files changed in this pass:
- `src/pages/dashboard/studentSubmission.css`
- `src/pages/dashboard/StudentSubmissionReview.js`
- `src/pages/dashboard/StudentSimilarity.js`
- `src/pages/dashboard/StudentSubmittedWork.test.js`
- `src/pages/StudentDashboard.workspace.test.js`
- This report.

The previous implementation already provided original-file previews, multi-page images, a lightbox, a portal-based source dialog, revision history, private/class comments, release-gated grades and feedback, and compact secondary disclosures. The remaining visual problems were a separate blue-gray submission palette, blue status tint, hardcoded focus/primary-control colors, a loosely aligned summary, no explicit ungraded value, and insufficient grouping of individual sources.

## Theme and presentation
1. Removed the independent dark surface/text palette. Local `--sr-*` aliases now reference existing `--workspace-surface`, `--workspace-bg`, `--workspace-text`, `--workspace-border`, `--text-secondary`, `--panel-soft`, and `--muted` tokens.
2. Reused `--accent`, `--accent-hover`, `--accent-soft`, `--on-accent`, and `--disabled-text` for grades, returned badges, controls, focus, feedback accents, and disabled states. No global tokens were added or adjusted. Light-mode action fallbacks retain WriteCheck green. The revision badge uses the existing workspace amber values.
3. Hierarchy: existing assignment heading and metadata ? compact submission/review/grade summary ? teacher feedback and resubmission action ? primary submitted document ? similarity ? optional details, history, and comments.
4. The summary is a three-column grid on desktop and one column below 640px. It retains one canonical status badge. Removed the repeated ?Submitted? prefix before the timestamp. Similarity stays in one dedicated section rather than duplicating its percentage in the summary.
5. Page charcoal, primary panel, and softer document/feedback surfaces now come from the same theme. Removed the document border; spacing and surface differences group content. Existing secondary disclosures remain borderless.
6. Primary values use workspace text; labels and metadata use secondary/muted text. Grade remains larger, including zero. Section headings use modest emphasis; readable 16px/1.8-line-height document text and bounded scrolling remain intact.
7. Submitted is a neutral badge; returned is softly green; revision requested is amber with a text label. No additional unpublished grading state is exposed.
8. Ungraded work explicitly says ?Not graded yet.? Returned-without-grade remains distinct. Actual feedback has a subtle accent edge; absent feedback remains a single line. Existing release gating is unchanged.
9. Original text, PDF, single-image, multi-page, download, image ordering, and lightbox behavior are retained. Source rows now separate titles, muted domain/word-count metadata, and accent-colored source links.
10. Similarity remains neutral, compact, and authorized through the existing API. Full sources appear only in the existing dialog; no raw URLs were added. Focus trapping/restoration, Escape, nested-dialog inertness, and accessible action labels remain covered.
11. Resubmission requests and their CTA remain before submitted work. Current-attempt retrieval, earlier history, archived-class restrictions, and revision-form routing are unchanged.
12. Existing navigation positioning and safe-area padding were retained. No new fixed navigation or positioning was introduced. Mobile preserves wrapping, single-column content, 44px controls, and nearly full-height scrollable dialogs.

## Verification
- 52 relevant tests passed across six suites. The first run found one outdated timestamp assertion; after updating it, both affected suites passed (29 tests), alongside the four already passing suites. Added explicit assertions for one status, pending review, and the ungraded value.
- Student navigation integration: 1 passed. Covers the real navigation components with mocked services.
- `npm run build`: passed. Existing unused-variable, duplicate-key, and hook-dependency warnings remain elsewhere in the application.
- Layout: 350 checks across 25 fixtures in both themes; zero horizontal-overflow, modal-fit, or small-button findings. Sizes: 360?800, 390?844, 430?932, 768?1024, 1024?768, 1366?768, and 1920?1080. Evidence: `artifacts/submitted-work-refinement-layout/results.json` and `issues.json`.
- `git diff --check`: passed.
- Contrast: 1,200 rendered views/states, 30,772 text checks, zero failures. Includes light/dark, default/expanded/hover/focus-visible, and six viewport sizes. Evidence: `artifacts/submitted-work-refinement-contrast/results.json` and `issues.json`.
- Manually inspected screenshots of the document view in both themes, mobile source dialog, desktop resubmission request, and inline returned-grade view. Text, labels, controls, and surfaces are cohesive with the existing palette.

Tests use mocked services. Some fixtures mock the header or file preview; the separate navigation fixtures use the real navigation. Image assets in browser fixtures are placeholders, while image ordering, navigation, and downloads are component-tested. Browser captures do not establish live-account/backend behavior or physical mobile keyboard behavior. No backend, SQL, release permissions, or source authorization was changed.
