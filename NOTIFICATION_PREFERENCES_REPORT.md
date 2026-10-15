# Notification preference controls

## Cause and changes

The existing checkboxes were disabled by `!services?.notifications?.configured`. Loading, a failed status request, or unavailable SMTP therefore prevented teachers from choosing preferences even though preference storage did not depend on email availability.

Teacher controls are now disabled only during saving (or for non-teacher accounts). Labels wrap the entire row, including description and native checkbox, so row clicks toggle once and Space works on the focused control. Responsive styles provide a 44px minimum row target, a nonshrinking 20px checkbox, theme-aware hover/focus styling, and a visible disabled state. A short note explains Save profile and email-service availability. Editing either preference clears the previous saved-success message.

## Persistence and delivery

Existing storage is reused: Supabase Auth `user_metadata.writecheck_preferences.notifyOnSubmissions` and `.weeklyDigest`, saved with **Save profile**. Dashboard loads those remote preferences after authentication; local storage remains a cache. Both existing defaults remain false. No schema, API, SMTP, Brevo, scheduler, or notification production-backend changes were necessary.

The email worker reads these preferences from the teacher's Auth metadata on each poll. Immediate submission emails require `notifyOnSubmissions === true`; Monday UTC digests separately require `weeklyDigest === true`. All four combinations are tested. SMTP still needs to be configured for delivery; saving an enabled preference does not imply a successful email delivery.

Existing resubmission semantics are preserved: delivery receipts are keyed by canonical submission ID. An in-place resubmission does not create another immediate email if that submission already has a delivery receipt. The digest remains the existing submission-count summary, not an attempt-event count. In-app notifications and unrelated assignment emails are unchanged.

Saving disables both controls. A failed remote save keeps the unsaved draft for retry, displays an error, does not update the preference cache or invoke the saved callback, and does not display success.

## Changed files

- `src/pages/dashboard/ProfileEditor.js`
- `src/responsive.css`
- `src/pages/dashboard/ProfileEditor.test.js`
- `backend/test_medium_features.py` (tests only)
- `scripts/verify-notification-preferences.cjs`
- This report and `artifacts/notification-preferences/` fixtures, screenshots, and browser results.

## Validation

- 17 frontend tests passed: profile editor, form validation, and theme suites.
- 14 backend medium-feature tests passed, including independent preferences, Monday-only digest, remote preference updates, receipt persistence/retry, and existing resubmission deduplication.
- 5 assignment-notification tests passed, including SMTP behavior.
- Headless Edge: six layout checks at 360/390/1366px in light/dark themes, no overflow, row toggling, focus styling, and disabled opacity verified. Mobile screenshots visually inspected. Browser fixtures use real rendered markup with mocked services; React interaction is covered separately by component tests.
- `npm run build` passed with existing lint warnings; `git diff --check` passed.

No real emails were sent and no live account preferences were changed. Persistence was verified using mocked Auth writes/reloads; worker behavior used mocked remote reads and email transport with real SQLite receipts. Live Supabase/SMTP deployment was not exercised.
