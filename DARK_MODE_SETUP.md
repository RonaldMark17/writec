# Workspace dark mode

Use the fixed Dark mode / Light mode button at the bottom-right of any page.
On small screens it becomes an icon with an accessible label. The landing-page
header toggle uses the same preference. Dialogs inherit the active theme.

The preference is stored on this browser using `writecheck-theme` and synchronized
across tabs. With no saved choice, the system color preference is used. This is a
browser preference, not an account setting shared across devices. Theme selection
runs before the initial page paint. Images, canvas and embedded document content
retain their original colors.

`src/theme.js` owns state and persistence. `src/ThemeToggle.js` provides the control.
`src/workspace-theme.css` maps existing workspace color utilities to the dark
palette, including neutral surfaces, status colors, inputs, borders and hover states.
After adding literal utility colors, regenerate it with:

```sh
node scripts/generate_workspace_theme.cjs
```

Validation: 89 frontend tests passed across 21 suites; production build passed with
existing warnings. Headless Edge checks passed for toggling, reload persistence,
navigation to transcription, mobile width and restoring light mode. The mobile
transcription screenshot was visually inspected. Protected workspaces receive the
global palette but were not independently browser-tested with live role accounts.
No database migration or backend setting is required. Deployment was not performed.
