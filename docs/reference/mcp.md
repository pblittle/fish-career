# MCP surface

Every tool, resource, prompt, and error code the `fish-career` stdio server
exposes. The rules this surface keeps (stable codes, result shape, safety
annotations) are in [`specs/mcp-contract.md`](../../specs/mcp-contract.md);
how an agent uses it is in
[How to drive fish from an agent](../how-to/drive-fish-from-an-agent.md).

The server starts when the entry point runs with no arguments, or with `mcp`
(`fish`, `fish mcp`, or `node fish-career/dist/index.js`). It reads
`FISH_HOME` and `$FISH_HOME/.env` at startup
([configuration](./configuration.md)).

## Tools

Every result carries a text rendering in `content` and `structuredContent`
that matches the tool's output schema. Annotations are `readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`, in that order.

| Tool | Does | Annotations (RO, D, I, OW) |
|---|---|---|
| `watchlist_probe` | Reads a slug's board on all four providers; writes nothing | yes, no, yes, yes |
| `watchlist_add` | Writes one board to the watchlist | no, no, yes, no |
| `watchlist_remove` | Removes a company by name | no, yes, yes, no |
| `fetch_postings` | Polls every watched board, writes unseen remote postings | no, no, yes, yes |
| `verdict_record` | Records the operator's grade for a cached posting | no, yes, yes, no |
| `triage_postings` | Scores postings with the judge, returns the ranked table | no, no, no, yes |
| `evaluate_ranking` | Holds the ranking to `preferences.json` | no, no, no, yes |
| `calibration_start` | Draws a seeded slice for blind ranking | no, no, no, no |
| `calibration_submit` | Records the operator's order, scores the slice, measures agreement | no, no, no, yes |
| `calibration_rescore` | Re-measures the latest calibration under the current rubric | no, no, no, yes |
| `profile_update` | Replaces the profile | no, yes, yes, no |

### `watchlist_probe`

| Input | Type | Notes |
|---|---|---|
| `slug` | string, required | The board token to look for |

Output: `slug`, `counts` (provider to live posting count, for each provider
that answered), `samples` (`{ provider, titles[] }`). Slugs collide across
companies, so read the titles before `watchlist_add`.

### `watchlist_add`

| Input | Type | Notes |
|---|---|---|
| `url` | string, optional | A posting or board URL on Ashby, Greenhouse, Lever, or SmartRecruiters, read offline |
| `provider` | `ashby`, `greenhouse`, `lever`, or `smartrecruiters`, optional | With `slug`, in place of `url` |
| `slug` | string, optional | With `provider` |
| `name` | string, optional | Display name; defaults to the slug |

Pass `url`, or `provider` and `slug`; both or neither is `INVALID_COMPANY`. A
URL on another system or a job search site is `INVALID_COMPANY` with the
reason. A name or board already watched returns the existing entry with
`added: false`. Output: `name`, `provider`, `slug`, `added`.

### `watchlist_remove`

| Input | Type | Notes |
|---|---|---|
| `name` | string, required | Matched case-insensitively |

Cached postings stay; only future polls stop. Output: `name`, `removed`.

### `fetch_postings`

No input. Over MCP a poll always reads every watched board with the default
window (14 days on the first poll, none after). The company filter and the
explicit windows that reconsider postings dropped for their date are CLI-only
(`fish fetch --company`, `--days`, `--all`; see the [CLI](./cli.md#fish-fetch)).

Output: `arrivals[]` (`company`, `title`, `comp`, `postingId`), `failures[]`
(boards that could not be read, with the reason), `perCompany[]` (`name`,
`total`, `remote`, `written`, `drops: { notRemote, offTarget, thinText,
outOfWindow }`), `firstRun`. Errors: `EMPTY_WATCHLIST`.

### `verdict_record`

| Input | Type | Notes |
|---|---|---|
| `postingId` | string, required | A `.txt` suffix is accepted and stripped |
| `label` | integer 0 to 3, required | 3 act on it now, 2 worth a look, 1 a miss, 0 should not surface |

Latest-wins: a second grade replaces the first and no history is kept. Output:
`postingId`, `label`, `profileHash`, `rubric`, `at`, `replaced`, `graded`,
`pending`. Errors: `POSTING_NOT_FOUND`, `INVALID_GRADE`,
`VERDICTS_UNREADABLE`.

### `triage_postings`

| Input | Type | Notes |
|---|---|---|
| `postingIds` | string array, optional | Score only these; the ledger is neither read nor written |
| `rescore` | boolean, default `false` | Score every cached posting again |

With neither, it scores the cached postings not yet scored under the current
profile and rubric, setting aside titles on the skip list. Output: `runId`
(readable at `fish://runs/{runId}`), `rows[]` (`postingId`, `title`,
`company`, `composite`, `dims` of `{ value, confidence }` per dimension,
`blocker`, optional `variants`), `errors[]`, `scored[]`, `skipped`,
`offTarget`. Errors: `NO_JUDGE`, `NO_PROFILE`, `NOTHING_TO_SCORE`,
`POSTING_NOT_FOUND`, `LEDGER_UNREADABLE`.

### `evaluate_ranking`

No input. Scores the postings `preferences.json` names and counts the pairs
the ranking satisfies; a pair is judged only when both postings were scored.
Output: `satisfied`, `total`, `violations[]` (`better`, `worse`,
`betterRank`, `worseRank`, `source`). Errors: `NO_JUDGE`, `NO_PROFILE`,
`NO_PREFERENCES`.

### `calibration_start`

| Input | Type | Notes |
|---|---|---|
| `count` | integer 2 to 30, default 10 | How many postings to draw |
| `seed` | integer, optional | Redraws the slice a previous seed drew |

Draws one posting per company per round from a seeded shuffle, and records
the slice as pending. Output: `postingIds[]`, `seed`, `slice[]` (`postingId`,
`company`, `title`). Errors: `NOTHING_TO_SCORE` (fewer than two cached
postings).

### `calibration_submit`

| Input | Type | Notes |
|---|---|---|
| `ranking` | string array, required | Every posting in the pending slice, best first |

Records the order, scores the slice, and saves the calibration. Output: `at`,
`rho` (Spearman, or `null` below two scored postings), `postingIds[]`,
`humanRanking[]`, `rows[]`, `errors[]`. Errors: `NO_PENDING_CALIBRATION`,
`INVALID_RANKING`, `NO_JUDGE`, `NO_PROFILE`.

### `calibration_rescore`

No input. Re-scores the latest calibration's slice and compares against its
recorded human order. Output: the `calibration_submit` fields plus
`previousRho`. Errors: `NO_CALIBRATION_HISTORY`, `NO_JUDGE`, `NO_PROFILE`.

### `profile_update`

| Input | Type | Notes |
|---|---|---|
| `content` | string, required | The whole profile in Markdown; replaces the file |

The profile is sent verbatim to the judge on every scoring call. Output:
`written`. Errors: `NO_PROFILE` (empty content).

## Resources

| URI | MIME type | Contents |
|---|---|---|
| `fish://profile/current` | `text/markdown` | The profile, or `(no profile yet)` |
| `fish://watchlist` | `application/json` | `[{ name, provider, slug }]` |
| `fish://postings` | `application/json` | `[{ postingId, title, company, location, compensation, url, published }]`, sorted by ID |
| `fish://postings/{postingId}` | `text/plain` | One posting's cached text, header included |
| `fish://rubric/current` | `application/json` | `{ version, dimensions[], blockerInstructions }` |
| `fish://calibrations/latest` | `application/json` | The latest calibration record, or `{ note }` |
| `fish://runs/latest` | `application/json` | `{ runId, records[] }` for the latest scoring run, or `{ note }` |
| `fish://runs/{runId}` | `application/json` | `{ runId, records[] }` for one run |

An unknown posting or run is a protocol-level resource-not-found error. A
trace record's fields are listed in [configuration](./configuration.md#state).

## Prompts

| Prompt | Arguments | Walks the host through |
|---|---|---|
| `career-search-onboarding` | none | Profile, watchlist, first fetch, first triage, first calibration |
| `review-new-arrivals` | `count`, 1 to 20, default 5 | Fetch, triage, and report the top rows, reading each posting |
| `explain-ranking` | `postingId`, optional | One posting's cells, or the last triage's top rows |
| `calibrate-rubric` | none | A blind calibration round and what each disagreement means |
| `audit-profile` | none | Vague lines, contradictions, gaps; writes only after confirmation |

## Error codes

A domain failure returns `isError: true` with `structuredContent.error = {
code, message, hint? }`. The code is stable; the message and hint are for
people and may change.

| Code | Raised by | Hint |
|---|---|---|
| `NO_JUDGE` | scoring tools | Put a TypeSafe API key in `FISH_HOME/.env`, or set `FISH_JUDGE=fake` |
| `NO_PROFILE` | scoring tools, `profile_update` | Write one with `profile_update` first |
| `EMPTY_WATCHLIST` | `fetch_postings` | Probe and add a company first |
| `NOTHING_TO_SCORE` | `triage_postings`, `calibration_start` | Fetch new postings, or rescore |
| `NO_PREFERENCES` | `evaluate_ranking` | Create `FISH_HOME/preferences.json` |
| `POSTING_NOT_FOUND` | `triage_postings`, `verdict_record` | List the cache from `fish://postings` |
| `INVALID_RANKING` | `calibration_submit` | Rank every posting in the pending slice |
| `NO_PENDING_CALIBRATION` | `calibration_submit` | Start one with `calibration_start` |
| `NO_CALIBRATION_HISTORY` | `calibration_rescore` | Run `calibration_start` and `calibration_submit` first |
| `INVALID_COMPANY` | `watchlist_add`, `watchlist_probe` (empty slug) | Probe the company first |
| `INVALID_GRADE` | `verdict_record` | Use 3, 2, 1, or 0 |
| `LEDGER_UNREADABLE` | `triage_postings` | Fix or remove `state/scored.json`; triage by posting ID still works |
| `VERDICTS_UNREADABLE` | `verdict_record` | Check `state/verdicts.json` |

Any other thrown error arrives with code `UNKNOWN`. An argument that fails
its input schema (a `label` of 5, say) is rejected by the SDK before fish
runs: the result is `isError: true` with a text message and no `error` code.

## Not on the MCP surface

These exist only on the CLI: `recall`, `quality`, `arrivals` listing and
`summary`, `postings explain`, the `fetch` company filter and windows, and
`calibrate reuse`. See the [CLI reference](./cli.md).
