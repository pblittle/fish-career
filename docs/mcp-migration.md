# Migrating from the 0.4 MCP surface

The 0.5 MCP contract renames several tools, splits probing from mutation, and
moves passive state from action-shaped tools to resources. The changes exist
so a client can understand safety without interpreting arguments, and so
protocol responses are typed instead of text-only.

## Tool changes

| 0.4 | 0.5 | Why |
|---|---|---|
| `watchlist_add` with `confirm=false` | `watchlist_probe` | Probing is read-only; mixing it into a mutation made safety argument-dependent |
| `watchlist_add` with `confirm=true` | `watchlist_add` (no `confirm`) | The tool now only writes; probe first |
| `watchlist_list` | resource `fish://watchlist` | Passive state belongs in a resource |
| `get_profile` | resource `fish://profile/current` | Same |
| `read_posting` (`file`) | resource `fish://postings/{postingId}` | Same, and the identifier is a stable posting ID |
| `triage` (`files`) | `triage_postings` (`postingIds`) | Stable IDs, and the name says what it scores |
| `evaluate` | `evaluate_ranking` | Symmetry with the calibration tools |
| `calibrate_start` / `calibrate_submit` / `calibrate_rescore` | `calibration_start` / `calibration_submit` / `calibration_rescore` | One namespace for the calibration round |
| `update_profile` | `profile_update` | One namespace for profile actions |
| — | `watchlist_remove` | New: removal was edit-the-file only |

Posting identifiers in every input and output are stable posting IDs (the
cache filename stem, e.g. `langchain-0a5dd30c-...`), not filenames. A
`.txt` suffix is accepted on input and stripped, so old scripts keep working.

## Result changes

- Every composable tool returns `structuredContent` that validates against its
  declared `outputSchema`, plus a concise text rendering for chat hosts.
- Expected failures return `isError: true` with
  `structuredContent.error = { code, message, hint? }`. Stable codes:
  `NO_JUDGE`, `NO_PROFILE`, `EMPTY_WATCHLIST`, `NOTHING_TO_SCORE`,
  `NO_PREFERENCES`, `POSTING_NOT_FOUND`, `INVALID_RANKING`,
  `NO_PENDING_CALIBRATION`, `NO_CALIBRATION_HISTORY`, `INVALID_COMPANY`,
  `LEDGER_UNREADABLE`.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
  `openWorldHint`) now describe each tool's safety.

## New surfaces

- Resources: `fish://profile/current`, `fish://watchlist`, `fish://postings`,
  `fish://postings/{postingId}`, `fish://rubric/current`,
  `fish://calibrations/latest`, `fish://runs/latest`.
- Prompts: `career-search-onboarding`, `review-new-arrivals`,
  `explain-ranking`, `calibrate-rubric`, `audit-profile`. They replace the
  checked-in starter prompt; they carry no seniority, geography, or
  compensation assumptions.

## The CLI is unchanged

`fish fetch`, `fish triage`, `fish evaluate`, `fish calibrate ...`,
`fish watchlist ...`, `fish profile ...`, and `fish postings ...` keep their
names and behavior; the root `*.mjs` shims still map the retired flags.
