# Frontend UI/UX fixes

## Join Classroom

The modal had no error output of its own. Its handler updated the dashboard's `StatusMessage`, which is outside the fixed `z-50` overlay. Duplicate membership was also treated as a success message and cleared the entered code.

The modal now owns `joinError` and renders an inline `role="alert"` next to the code field. The input is connected with `aria-describedby` and `aria-invalid`; the modal has an accessible dialog name. No notification z-index workaround is needed. Failed joins keep the dialog open and retain the code. Editing, closing, reopening, and successful joining clear the error. Controls are disabled during the request to prevent stale responses after editing or closing.

Local membership, database membership, and duplicate-insert races show “You are already a member of this classroom.” A successful lookup with no record shows “Classroom not found. Please check the class code and try again.” Returned server messages are preserved; thrown network errors and empty errors have a visible fallback. Existing queries, membership insertion, and successful refresh behavior remain.

## Registration email

Student and teacher registration share a case-insensitive, fully anchored `^[^\s@]+@edu\.ph$` check. A nonempty invalid address warns as soon as there is text after `@`, or on blur. Empty fields do not produce a domain warning. Correcting the address clears the warning immediately. The button remains disabled for incomplete fields or an invalid email, and the submit handler repeats validation before calling Supabase Auth. Required fields, passwords, duplicate accounts, confirmation, and approval checks remain.

Admin-created student/teacher accounts use the same exact-domain rule in the UI and FastAPI endpoint. Existing accounts can still sign in; the new domain rule applies to account creation.

**Database action required:** apply `registration_exact_domain.sql` after `registration_edu_ph.sql` and `registration_required_fields.sql`. The existing database functions allow `.edu.ph`, so a migration is genuinely required to enforce the requested narrower rule. This migration replaces the Auth insert domain validator and the corresponding profile guard, preserving ownership and approval protections. It does not alter existing accounts or tables. It has been tested locally, **not applied to live Supabase**. Until applied, direct Supabase signup still follows your deployed rules. Restart the full backend to load the admin endpoint change.

## Shared dark palette

The homepage used inline gray/green theme variables, while generated workspace CSS used a separate blue-gray palette. The homepage's existing dark values now live in `src/darkPalette.json`. The CSS generator publishes those variables on the dark root, and both homepage and workspace inherit them.

- Page: `#202124`; panels: `#292a2d`; secondary surfaces: `#303134`.
- Text: `#e8eaed`; muted text: `#9aa0a6`; borders: `#3c4043`.
- Accent: `#81c995`; hover: `#a8dab5`; existing translucent accent surfaces retained.
- Existing `--page-bg`, `--page-text`, `--panel`, `--panel-soft`, `--muted`, `--border`, `--accent`, and other homepage variables are reused. Workspace aliases reference them.
- Added `--danger-background` and `--danger-text` for readable inline errors and existing error utilities.

The existing compatibility stylesheet maps shared Tailwind utilities to these tokens, covering student, teacher, admin, classroom/assignment views, grades, Scan Station, profile, comments, dialogs, tables, dropdowns, pagination, empty states, and result/submission cards. Header backgrounds, scrollbars, form controls, and green action buttons share the palette; accent buttons use a dark foreground for contrast. Existing layout and business logic were not redesigned. Light utility colors and homepage light variables remain unchanged. Theme persistence and live switching continue through the existing `theme.js` behavior.

Regenerate compatibility CSS after adding literal color utilities with `node scripts/generate_workspace_theme.cjs`.

## Files changed for this request

- `src/pages/StudentDashboard.js`, `src/pages/StudentDashboard.workspace.test.js`
- `src/pages/AuthModal.js`, `src/pages/AuthModal.test.js`
- `src/pages/AdminDashboard.js`, `src/pages/AdminDashboard.test.js`
- `src/pages/Startup.js`, `src/darkPalette.json`, `src/workspace-theme.css`
- `scripts/generate_workspace_theme.cjs`, `scripts/test-workspace-palette.cjs`
- `backend/admin_api.py`, `backend/test_admin_api.py`
- `registration_exact_domain.sql`, `scripts/test-registration-domain.cjs`
- `FRONTEND_UX_FIXES.md`

Prior multi-page, registration-required-fields, navigation, SMTP, and similarity work was preserved.

## Verification

- **72 frontend tests passed in 4 suites:** join success, missing classroom, local/server/race duplicate membership, network/server failures, visible errors inside the dialog, code retention, clearing errors, early email warnings, exact-domain/case handling, required fields, passwords, duplicate accounts, approval, admin behavior, and existing workspace/theme persistence tests.
- **17 backend admin tests passed**, including rejection before upstream account creation for invalid domains.
- **15 PostgreSQL/PGlite checks passed:** actual Auth trigger rejection for six invalid domains for both roles, uppercase valid accounts with pending profiles, preservation of existing accounts, and repeatable migration application.
- **14 headless Edge browser checks passed** against compiled production CSS: shared homepage/workspace background, panels, text, borders, secondary surfaces, inputs, action/error colors, and exact restoration of light-mode colors without reload.
- Production build passed with existing lint warnings; `git diff --check` passed.

The browser checks use representative real utility classes, not a full authenticated tour of every screen. Live Supabase registration and authenticated classroom joining were not exercised. Apply the SQL, restart the backend, and visually review your authenticated student/teacher/admin screens in both themes before deployment.

## Accepted-domain correction

Registration now accepts institutional addresses ending in `.edu.ph`, with at least one domain label before `edu.ph`, such as `student@school.edu.ph` or `teacher@dept.school.edu.ph`. Validation is case-insensitive. Bare `@edu.ph`, `@edu.com.ph`, malformed domains, and suffix spoofing are rejected. Frontend registration, admin creation, FastAPI, and both SQL guards enforce the same rule. Re-run the updated `registration_exact_domain.sql` if an earlier version was applied, and restart the backend. The migration has not been applied to live Supabase.
