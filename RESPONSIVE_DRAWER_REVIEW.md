# Responsive review and mobile drawer

## Baseline review

The previous work was not sufficient for the requested mobile navigation experience: `ResponsiveNavigation` was a two-column inline dropdown, with no overlay, body scroll lock, focus containment, profile header or automatic desktop-resize dismissal. It also omitted the shared notification unread count and drawer theme controls.

The existing page layouts were substantially implemented and passed the baseline browser audit: 27 rendered component fixtures × seven viewport sizes × two themes = 378 checks, with no detected overflow, undersized tested buttons or out-of-bounds panels. Eight reduced-height input checks passed. This supports preserving those layouts; it is not a claim that every possible live-data combination or physical device was tested.

Inspected coverage included Student/Teacher/Admin destinations, classroom cards, assignments, submissions, Scan Station, notification list/sheet, Gradebook, roster, account approval/bulk actions, forms, profile, calendar, file uploads, review/highlighting, source dialog and comments. Existing responsive implementations include mobile labeled table cards, stacked filters, single-column classrooms, calendar agenda presentation, full-width inputs, 44px controls, responsive pagination, viewport-constrained dialogs and a mobile notification sheet. Teacher review already prioritizes the similarity overview, essay and grading; original files are expandable and sources/peers are in a separate dialog. These working behaviors were retained.

## Changes

- `src/pages/dashboard/ResponsiveNavigation.js`: reused the same destination children inside a portal-based drawer. Added identity header, X, overlay dismissal, Escape, focus containment/restoration, body/root scroll locking with cleanup, desktop resize handling and the existing theme control. Navigation actions close the drawer; a prevented/blocked action stays open. Theme switching keeps it open.
- `src/pages/dashboard/shared.js`: supplies the profile to the shared drawer and displays the existing unread count with Notifications. Existing page handlers, Profile and Sign out are reused.
- `src/pages/StudentDashboard.js` and `TeacherDashboard.js`: pass their existing notification model's unread count; no new subscription or polling.
- `src/pages/AdminDashboard.js`: uses the same drawer with current Admin destinations, Profile and Sign out. Existing blocked-navigation behavior during saves is retained. No unsupported Admin notification destination was added.
- `src/responsive.css`: drawer styles use existing workspace/accent tokens, a subtle overlay, `min(85vw, 320px)` width, scrollable `100dvh` height, safe-area padding, 44px controls and a 220ms slide-in animation. Reduced-motion disables animation.
- `src/pages/dashboard/ResponsiveNavigation.test.js` and `src/responsive.test.js`: added focus/scroll/resize/overlay checks and Teacher/Admin drawer fixtures, including the existing unread badge.
- `scripts/verify-responsive.cjs`: measures drawer bounds after animation settles and returns a failing exit code for layout or reduced-height field failures.

Desktop navigation remains as implemented: horizontal for Student/Teacher, existing Admin navigation on desktop. The mobile/tablet switch stays at **below 1024px**, matching the existing workspace breakpoint rather than introducing a conflicting 768px cutoff. Phone content/table-card behavior remains below 768px.

No backend APIs, authorization, grading, Copyleaks data, source coordinates, highlighting or export logic changed. Student codes remain visible only through classroom information. Existing close controls and draft behaviors are preserved.

## Verification scope

Requested viewports: **360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768 and 1920×1080**, each in light and dark mode. Browser layout checks use rendered real components with mocked services; interaction tests use React Testing Library. Reduced-height checks approximate keyboard space and do not emulate a physical device IME. No authenticated AWS deployment test was performed.

Frontend suite: **48 suites / 293 tests passed**. The focused responsive/navigation rerun after adding role fixtures passed **8 tests**. Existing test output includes jsdom `scrollTo` and asynchronous React `act` warnings.

Final browser audit: **406 checks passed** (29 fixtures × seven sizes × two themes), with zero reported layout issues; all eight reduced-height field checks also passed. Student, Teacher and Admin drawer screenshots were visually inspected. The production build passed with pre-existing lint warnings; the new drawer has no lint warnings. Its final ref-cleanup adjustment was followed by four passing drawer tests and another successful build. `git diff --check` passed.

Artifacts: [audit results](artifacts/responsive-drawer/results.json), [issues](artifacts/responsive-drawer/issues.json), [Student light](artifacts/responsive-drawer/student-menu-light-390.png), [Student dark](artifacts/responsive-drawer/student-menu-dark-390.png), [Teacher](artifacts/responsive-drawer/teacher-menu-light-390.png), [Admin](artifacts/responsive-drawer/admin-menu-dark-390.png).

Reproduction:

```powershell
$env:CI='true'
$env:WC_CAPTURE_DIR="$env:TEMP\writecheck-responsive-after"
npm test -- --watchAll=false --runInBand src/responsive.test.js src/pages/dashboard/ResponsiveNavigation.test.js
npm run build
node scripts/verify-responsive.cjs "$env:TEMP\writecheck-responsive-after" artifacts/responsive-drawer
```

The layout audit saves screenshots, viewport metadata, issues and reduced-height checks. Static snapshots do not execute React navigation or resize handlers; those behaviors are covered by the interaction tests. Live-device touch, screen-reader and software-keyboard testing remain useful follow-up checks before release.
