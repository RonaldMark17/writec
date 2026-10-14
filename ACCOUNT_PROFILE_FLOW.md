# Sign-out confirmation and profile identity

## Implementation

- Added `src/SignOutConfirmation.js`: one shared styled confirmation used by Student/Teacher headers, their mobile drawer, Admin header/drawer/profile page, the profile editor, and dashboard loading/error sign-out buttons. Cancel and Escape only close the confirmation. Confirm calls the existing `signOutAndExpireToken('/login')`; no second session-clearing implementation was added. Automatic invalid/expired-session logout in `App.js` remains automatic.
- Added `src/profileIdentity.js`: shared salutation-before-name and role formatting. It reads the existing `academicTitle` preference, with an existing `salutation` value accepted as fallback. Known stored long-form titles Professor/Doctor display as Prof./Dr. No title is inferred from role, gender, email or name. Existing matching prefixes are not duplicated. Empty salutations produce the ordinary name. Admin is displayed as Administrator.
- Updated `src/pages/dashboard/shared.js`: full header identity uses the formatter, role appears beneath the name, compact names have a full title, and all manual logout actions use confirmation. Existing raw-name avatar initials are retained.
- Updated `src/pages/dashboard/ResponsiveNavigation.js`: identity includes the existing avatar or shared initials helper, formatted name and role; existing navigation and Profile actions precede Appearance. Sign Out is last in a separated flexible footer, without absolute positioning. The drawer closes before confirmation takes its scroll lock. Theme changes keep the drawer open.
- Updated `src/pages/dashboard/ProfileEditor.js`: salutation is above the existing full-name input for every role, preserving the existing `academicTitle` storage. Identity order is name, role, email and useful account metadata. Removed both Bio sections, Bio state and Bio from the save payload. Removed inferred title/default institution/department values. Appearance and confirmed Sign Out are separated from editable details and saving. Existing avatar upload/removal, account RPC, preference persistence and validation remain.
- Updated `src/pages/AdminDashboard.js`: shared confirmation on all manual sign-out paths, formatted profile identity, role before email, and separated Appearance/Sign Out actions on the profile page.
- Updated `src/pages/Dashboard.js`: loading/error screen manual sign-out buttons also confirm.
- Updated `src/workspace-theme.css` and `src/responsive.css`: token-based dialog/danger styling, 44px controls, narrow-screen action stacking and drawer footer hierarchy.
- Tests: added `src/SignOutConfirmation.test.js`, `src/profileIdentity.test.js`; updated `ProfileEditor.test.js`, `AdminDashboard.test.js`, and `src/responsive.test.js`.

## Compatibility and scope

There was no desktop avatar dropdown: the avatar opens the shared Profile editor directly. That interaction was preserved rather than adding a competing menu. Existing desktop navigation remains intact.

The account model uses one `full_name` field. The form retains this instead of guessing how to split existing multi-part names or introducing first/last-name columns. Salutation precedes that field and the displayed identity. Email remains displayed through its existing read-only account identity behavior.

No database migration or backend change was needed. Legacy Bio fields remain compatible with profile retrieval; no stored values were bulk-deleted. New profile saves do not include Bio. Account name saving still uses `update_my_profile`; preferences still use the existing Supabase Auth metadata workflow.

## Accessibility and responsive behavior

The confirmation has an accessible title and description, initial Cancel focus, Tab containment, Escape cancellation, busy-state duplicate prevention and error feedback. Cancel restores the original trigger where available; when a drawer trigger has been removed, it returns to the visible menu button. The nested dialog stops keyboard events from closing the underlying Profile editor. Its scroll lock restores the prior state on close.

The confirmation fits the viewport, scrolls if necessary and stacks its buttons on very narrow screens. Appearance and destructive colors use existing light/dark tokens. Drawer names and profile emails wrap, and Sign Out is last even on short screens. No authentication, notification, grade, submission or Copyleaks data was changed.

## Verification

Tests cover confirmation/cancellation, all three drawer roles, session handler reuse, Admin's real header confirmation, profile title ordering, no-title behavior, legacy Bio loading without Bio in the save payload, and preserved profile saves. The Admin header theme test now scopes its query to the header because the Profile page intentionally has its own Appearance control.

Browser checks use real rendered components with mocked services at 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768 and 1920×1080, in both themes. They cover all three drawers, Student profile, a long-name Teacher profile and sign-out confirmation. This is local component/layout verification, not live-account or AWS deployment testing. Physical screen readers and mobile software keyboards were not tested; reduced-height checks only approximate keyboard space.
