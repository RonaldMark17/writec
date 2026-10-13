# Copyleaks highlight pipeline fix

The report layout and CSS are unchanged by this follow-up. The real 75.2% / one-source example now renders 25 yellow matched passages in the local browser verification, using evidence recovered from Copyleaks and read back from Supabase.

1. **Exact failure and retrieval.** Both matching historical submissions had only summary data in `submissionTable.scan_result`, no evidence artifacts, and no `evidence_export` checkpoint. The source ID survived in `submission_jobs.provider_result.results.internet[]`. The completed callback does not contain comparison coordinates. Additionally, `install_account_guard` rejected the separate signed evidence callbacks with HTTP 401 before their handler could authenticate them. The live callback endpoint reproduced this failure. The guard now lets POST evidence callbacks reach their own signature/scan/source validation. Export requests now use unique export IDs instead of the shared literal `evidence`.

2. **Detailed-result source identity.** Normal operation uses `CopyleaksService.export_match_evidence`: it requests crawled text plus a detailed result for every source ID, not just the first. Signed callbacks arrive at `/api/plagiarism/evidence/{scan_id}/{artifact}`; `artifact` is the exact result ID. The current example's ID is `1c7886b81f`, and its title/URL remain the actual PMC values. This follows the provider's [export contract](https://docs.copyleaks.com/reference/actions/downloads/export/).

3. **Storage and historical recovery.** The existing private `submission_match_evidence` table now contains the crawled text and 25 compact ranges for each of the two matching 75.2% records. No migration was added. Recovery used read-only downloads of the existing scans, followed by the existing `save_submission_match_artifact` RPC, and verified a database read-back. No scan was submitted or charged. The one-off recovery used the still-working legacy download endpoints; application code continues to use the supported Export API. No provider credentials, student identity, or full external webpage text were added to the fixture. Old completed records without an export checkpoint now receive one background export request, claimed with a conditional database update so polling/concurrent opens do not repeatedly export. Ready stored evidence never requests another export.

4. **Identical matches.** `compact_artifact` reads `text.comparison.identical.source.chars.starts/lengths`. The real result contains 18 ranges. `167 + 65 = 232` yields exactly `The frequent\nincidences of similarity, plagiarism, and retraction`.

5. **Minor changes.** The same transformation reads `text.comparison.minorChanges.source.chars`. The six real ranges include `[93,166)`, the sentence beginning `The institutional integrity constitutes`.

6. **Related meaning.** The same transformation reads `text.comparison.relatedMeaning.source.chars`. Its real range `[15,85)` is the Turnitin title. All three categories use the existing yellow style; their category is retained as `match_kind` / `matchType` and DOM metadata.

7. **Student-side coordinates.** Only `.source.chars` is used. For each pair, `end = start + length`, exclusive. Backend extraction respects UTF-16 character units; JavaScript `slice(start,end)` uses those units. The provider's crawled `text.value` and saved/displayed transcription were character-for-character identical: 1,620 characters. No whitespace, punctuation, case, or line-break normalization was required or applied.

8. **External-document coordinates.** `.suspected.chars` is not applied to the student text. Tests use the actual comparison arrays on both sides to ensure only the student-side ranges reach the report. The [provider result schema](https://docs.copyleaks.com/reference/data-types/authenticity/results/new-plagiarism-result/) documents the comparison structure.

9. **Normalization and overlaps.** `attach_evidence` creates `matchedSources[].matching_fragments` with `start`, `end`, `matched_text`, and `match_kind`, bound to the exact scanned text. Invalid/out-of-bounds ranges are rejected instead of being guessed. The frontend validates and sorts ranges, then splits at every boundary into nonoverlapping segments. Each segment retains every contributing source; text is neither duplicated nor skipped, and marks are not nested. Adjacent distinct evidence is kept separate when needed to preserve source/category identity.

10. **Rendering.** `collectEvidence` and `evidenceSegments` in `similarityEvidence.js` feed `EssayEvidence.js`. It renders `<mark class="essay-match">` with `data-source-ids`, `data-match-types`, and the existing source-index metadata. The existing `.review-workspace .essay-match` rule supplies the yellow background. Clicking the title resolved to `https://pmc.ncbi.nlm.nih.gov/articles/PMC6398291/`. No layout or CSS changes were needed.

11. **Visual confirmation and scope.** Headless Edge rendered the actual `SubmissionReview`/`EssayEvidence` components using the real recovered record read back from Supabase, with unrelated comments/file-preview adapters disabled. Sources showed all 25 marks, Plain removed every mark, and Sources immediately restored them. Remounting from the saved report restored the same evidence. Every phase preserved all 1,620 characters and made zero scan requests. Light-mode backgrounds were `rgb(254,243,205)`; dark mode used `rgb(73,62,35)` with light text. Both screenshots were visually inspected: [light](artifacts/copyleaks-highlights/light.png), [dark](artifacts/copyleaks-highlights/dark.png). This was local browser verification with real stored data, not an authenticated session on the deployed Teacher website. The backend code changes still need deployment for future automatic callback/backfill handling; the current examples' database evidence is already repaired.

12. **Tests.** 38 frontend tests passed across report, renderer, range builder, and submission-progress suites (including the added multiple-source overlap test). 49 backend tests passed across evidence, status, checker, and account-guard suites. Coverage includes all 25 real ranges, all three match categories, correct PMC source resolution, Sources/Plain switching, unchanged canonical text, reload, multi-source overlap, signed callbacks through the real account middleware, unsigned callback rejection, export claims, unique export IDs, export failure without rescanning, and access/stale-report checks. The browser verification passed in both themes. `git diff --check` passed.

Reproduce the browser check after a production CSS build:

```powershell
node scripts/test-copyleaks-highlights.cjs
```

An optional path argument accepts a saved verified submission JSON (`transcribed_text` and `scan_result`) rather than the sanitized real-data regression fixture. The check does not call Copyleaks or submit any essay.
