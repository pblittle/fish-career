# 0003: the application core, its ports, and its adapters

Status: accepted · 2026-09-25

## Problem

The MCP server had grown into the application: its handlers read directories,
orchestrated fetch and scoring, and rendered results. The CLI scripts
reimplemented slices of the same decisions. A change to candidate selection
had to be made twice and could drift. Posting filenames leaked into the
contract (`read_posting`, `triage` files, calibration rankings), so storage
layout was load-bearing. Nothing could run the complete workflow without a
filesystem, a clock, or the network, so the tests could only cover pieces.

## Contract

### Layout

```text
src/domain        pure policy: posting, rubric, answers, ranking,
                  preferences, calibration, ledger, admission, random, errors
src/ports         interfaces: ats-provider, judge, posting-repository, ledger,
                  trace-sink, stores, clock
src/application   use cases over a dependencies object
src/adapters      ats, judge (jev, fake), filesystem, fake (in-memory)
src/interfaces    mcp (server), cli (commands, demo)
src/bootstrap     createApplicationFromHome, createServerFromHome
```

### Use cases

- `fetchPostings({ companies?, days? })`
- `rankPostings({ postingIds?, rescore? })`
- `evaluateRanking()`
- `startCalibration({ count?, seed? })`, `submitCalibration({ ranking })`,
  `rescoreCalibration()`
- `probeCompany`, `addCompany`, `removeCompany`, `listWatchlist`
- `getProfile`, `updateProfile`, `listPostings`, `readPosting`, `rubric()`

MCP handlers and CLI commands call these and render; neither reads a
directory, builds a judge prompt, or decides an order.

### Stable posting IDs

A posting's ID is its cache filename stem (`langchain-0a5dd30c-...`), not the
filename. Ledger entries, traces, calibrations, preferences, the MCP tools,
and the CLI all speak IDs. The filesystem adapter maps ID to file. Ledgers and
preferences written before this change keyed on filenames and are normalized
on read, so existing state survives.

### Boundaries validated at runtime

- Judge responses: a runtime schema requires the hard blocker and every
  dimension with a finite score and a confidence in 0..1. A malformed answer
  fails that posting loudly rather than being clamped.
- Watchlist entries and preferences: invalid entries are dropped, not trusted.
- The ledger: corruption is reported, never silently reset.

### Determinism

- Calibration draws use a seeded random source; the seed is recorded with the
  pending slice, and `--seed` redraws it.
- The demo runs the real use cases over in-memory adapters and bundled
  fixtures: no network, no API key, no user state.

### Errors

Use cases throw `ApplicationError` with a stable code (`NO_JUDGE`,
`NO_PROFILE`, `EMPTY_WATCHLIST`, `NOTHING_TO_SCORE`, `NO_PREFERENCES`,
`POSTING_NOT_FOUND`, `INVALID_RANKING`, `NO_PENDING_CALIBRATION`,
`NO_CALIBRATION_HISTORY`, `INVALID_COMPANY`). Surfaces render the message;
the MCP contract work in a later spec maps the codes to protocol errors.

### Surfaces

- The `fish` CLI is the blessed interface: `fetch`, `triage`, `evaluate`,
  `calibrate start|submit|reuse|rescore`, `watchlist list|probe|add|remove`,
  `profile get|set`, `postings list|read|explain`, `demo`.
- `postings explain` returns the raw typed answers and cost for one posting;
  `--dry-run` prints the request without sending it. `calibrate reuse` redraws
  the pending slice from its recorded seed.
- The root `fetch.mjs`, `triage.mjs`, and `probe-boards.mjs` become shims over
  the CLI and keep their old `FISH_HOME` default; the shims map retired flags
  (`--explain`, `--dry-run`, `--reuse`, `--sample`, `--evaluate`) onto the
  commands above.
- The MCP tool names and behavior are unchanged by this spec; the typed,
  structured MCP contract is a separate change.

## Non-goals

- No change to scoring math, rubric data, ranking rules, or fetch semantics.
- No MCP resources or prompts yet.
- No hosted or multi-user concerns.

## Acceptance

- `npm --prefix fish-career test` green, including a complete-workflow test
  over in-memory ports and a demo test with `fetch` stubbed to throw.
- `fish demo` exits 0 with no API key and no network.
- No file under `src/interfaces` or `src/application` imports
  `node:fs` or calls `fetch`.
