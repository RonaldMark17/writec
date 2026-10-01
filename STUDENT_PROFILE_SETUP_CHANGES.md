# Student academic profile setup

Approved students with missing academic details are prompted when opening their workspace to add college/year level, course/program, and university/college. The prompt reuses the existing ProfileEditor and styling. Closing it allows the current visit to continue; it returns on the next workspace visit if details are still missing. Existing students and admin-created students are included. Pending/rejected accounts retain the existing approval gate.

Students can edit these details later through their profile. Saving requires all three nonblank fields. College levels include years 1–6 and graduate studies; existing high-school options remain available.

The profile preference allowlist previously omitted gradeLevel and courseTrack, although the editor saved those fields. They are now included so the existing Supabase Auth metadata loading path restores them across logins and devices. Values are saved through authenticated auth.updateUser under writecheck_preferences, with the existing browser cache updated only after remote save succeeds. These are self-reported profile details, never authorization fields. Role, account status, and identity remain authoritative database fields.

Changed files: src/profilePreferences.js, src/pages/Dashboard.js, src/pages/dashboard/ProfileEditor.js, new StudentProfileSetup.js, and their component tests. No database schema or API changes and no SQL migration are needed.

Manual checks:
1. Sign in as an approved student with incomplete details; verify the profile setup prompt appears.
2. Select a college level and enter a course and university. Save, refresh, and reopen the profile; all values should remain and the setup prompt should not return.
3. Try saving blank academic details; verify an error and no success message.
4. Edit the details through the profile menu, then log in on another browser and check persistence.
5. Verify teachers/admins receive no student setup prompt and pending students still cannot enter their workspace.
