# Classroom information and Grades navigation

Implemented in the existing React UI; no API, database migration, permission policy, or package installation was needed.

1. **Files:** added `src/pages/dashboard/ClassroomInformation.js`; updated `ClassroomDetail.js`, `TeacherDashboard.js`, `StudentDashboard.js`, and `src/workspace-theme.css`. Added `ClassroomInformation.test.js`, updated both dashboard workspace test files, and added `scripts/test-classroom-information.cjs` for browser checks.
2. **Student code location:** the opened classroom details area displays the stored class code. Active and archived classroom cards also have an information dialog containing the code. Missing codes are not invented.
3. **Copy:** the shared `ClassCode` component replaces the previous Teacher card clipboard block and is reused by Students and dialogs. It copies the exact code through the existing Clipboard API approach, confirms success only after the promise resolves, clears feedback after three seconds or code changes, and reports clipboard failures.
4. **Permissions:** these are read-only controls. Students receive no rename, regenerate, archive or member-management action from them. The existing membership-scoped classroom loading and backend/database authorization remain unchanged. No broader query or new endpoint was introduced.
5. **Grades X:** an accessible Close icon is at the upper right of the Teacher Grades & Submissions header.
6. **Navigation:** entering Grades captures the current classroom, including entry through its Gradebook button. Close returns to that classroom. Entry from the dashboard class list returns to the list. Changing Grades filters does not change the saved origin. Missing/deleted origins fall back to the class list. Close changes local navigation state only; it does not call a mutation, delete records, or clear grade filters. Browser history is not used.
7. **Information icons:** added to each Teacher and Student classroom card, including archived cards, and to the shared classroom details toolbar.
8. **Teacher information:** classroom name, available subject/section, teacher display name, student count and active/archive status, plus existing class code.
9. **Student information:** classroom name, available subject/section, teacher display name and existing class code. Internal IDs, email addresses and nested account/membership objects are never rendered.
10. **Propagation:** information triggers and dialog events stop propagation. Opening information does not open the classroom. The dialog uses a portal so card overflow cannot clip it.
11. **Themes and responsive layout:** new controls use existing workspace surface/text/border and accent variables. Dialog width is constrained to the viewport, long names wrap, code controls wrap, and tall content can scroll. Real component browser checks passed at actual viewport widths 496 and 1414 pixels in both themes, without horizontal overflow. This was local component verification, not an authenticated production session or a physical-phone test.
12. **Accessibility:** icon buttons have labels and titles; icons are decorative SVGs consistent with the existing shared icons. The dialog has an accessible heading, initial focus, Tab containment, Escape dismissal and focus restoration. Copy feedback uses a status region. Controls have visible keyboard focus styles.
13. **Tests:** new coverage checks safe field selection, classroom isolation, exact code copy, clipboard failure, feedback reset, event propagation, Escape/focus return, teacher count/status, Student A/B code switching and absent management actions, and Grades Close origins despite filter changes.
14. **Results:** 48 tests passed across the information, classroom detail and both dashboard workspace suites (47 in the initial four-suite run, followed by all 21 Student tests passing after one additional test). Production build succeeded with existing lint warnings. `git diff --check` passed. Four browser theme/viewport combinations passed.

Reproduce the visual check after a production build:

```powershell
node scripts/test-classroom-information.cjs
```

Screenshots: [light narrow](artifacts/classroom-information/light-520.png), [dark narrow](artifacts/classroom-information/dark-520.png), [light desktop](artifacts/classroom-information/light-1440.png), [dark desktop](artifacts/classroom-information/dark-1440.png).

These changes are local and require the normal frontend deployment to appear on the hosted website.
