# The posting pipeline: fetch, triage, and the application core

Status: accepted · 2026-09-22 · boundary rule amended 2026-09-27, 2026-09-28

## Problem

Job postings originate on public, official, no-auth ATS feeds (Greenhouse,
Ashby, SmartRecruiters, Lever) that any client may poll. LinkedIn is a
middleman that hides compensation and can restrict the account; watching the
feeds directly yields a daily diff of exactly the companies worth watching,
with the comp data included.

The scarce resource is the operator's attention. The pipeline's job is to
convert an unbounded stream of postings into a small ranked table with the
reasons attached, and to prove measurably that the ranking tracks the
operator's own judgment rather than a model's taste.

The MCP server had grown into the application: its handlers read directories,
orchestrated fetch and scoring, and rendered results, while the CLI
reimplemented slices of the same decisions, so a change could drift. Posting
filenames leaked into the contract, so storage layout was load-bearing, and
nothing could run the complete workflow without a filesystem, a clock, or the
network, so tests could only cover pieces. The core, the ports, and the
runtime boundary below are the answer.

## Contract

### fetch: watchlist to postings cache

- Four public ATS APIs, one flat posting shape: `TITLE`, `COMPANY`,
  `LOCATION`, `COMPENSATION`, `URL`, `PUBLISHED`, plus the full body.
  `COMPENSATION` is the provider's structured field; when that is empty, the
  adapter lifts the first salary range the body states, verbatim, and
  otherwise writes `not stated`. A lone figure is never lifted.
- Remote postings only. Every observed remote posting is marked seen, written
  or not; later polls deliver arrivals only. A recency window applies on the
  first poll (or an explicit `--days`).
- A body too thin to score is resolved through the provider's detail
  endpoint, or dropped as thin text if it stays thin; the split drop reasons
  are in [`specs/quality.md`](./quality.md).

### triage: postings to ranked rows

- One judge call per posting: five Score dimensions plus one Noul
  hard-blocker. Weights, criteria, and blocker instructions are data in
  `DIMENSIONS` in `src/domain/rubric.ts`, versioned by `RUBRIC_VERSION`, where
  they can be argued with.
- Judge calls retry with backoff on 429, 5xx, and dropped connections; a 4xx
  throws at once. Every call writes a trace: latency, token usage, raw
  answers, profile hash, rubric version.
- Every row a whole-cache run scores checkpoints to the ledger immediately; a
  crash loses at most the row in flight. A run over named postings is a spot
  check: it scores and traces but leaves the ledger alone, so it neither
  settles nor refreshes those entries.
- Ranking: a blocker at 0.5 or above demotes a row below every clean row,
  regardless of composite. Region-labelled variants of one vacancy collapse
  to one row that names the other offices; a bare base title stays its own
  row, because hiding a distinct posting is worse than showing a duplicate.
- The ledger records score plus provenance (profile hash, rubric version). A
  profile or rubric change re-scores stale entries on the next run; the
  operator never babysits invalidation.
- A run with nothing to score throws `NOTHING_TO_SCORE`. Its message says
  whether the cache is empty or every posting is already scored under the
  current profile and rubric, because the two call for different next steps.

### evaluate and calibrate: the measurements

- `evaluate`: pairwise preferences in `preferences.json`, each quoting the
  profile line it came from. The ranking must satisfy all of them.
- A golden fixture of recorded judge answers runs the same eval in CI with no
  network and no key.
- `calibrate`: optional and stronger. Spearman agreement against a hand-ranked
  slice, for when an operator will rank one.

### Layout: the application core, ports, and adapters

```text
src/domain        pure policy: posting, rubric, answers, ranking,
                  preferences, calibration, ledger, admission, verdicts,
                  metrics, quality, random, errors
src/ports         interfaces: ats-provider, judge, posting-repository, ledger,
                  trace-sink, trace-reader, stores, clock
src/application   use cases over a dependencies object
src/adapters      ats (four boards), judge (jev, fake), filesystem (stores,
                  ledger, JSONL traces), fake (in-memory), trace (LangSmith,
                  multi-sink fan-out)
src/interfaces    mcp (server, tools, resources, prompts, schemas),
                  cli (commands)
src/bootstrap     createApplicationFromHome, createServerFromHome
```

### Use cases

- `fetchPostings({ companies?, days? })`
- `rankPostings({ postingIds?, rescore? })`
- `evaluateRanking()`
- `startCalibration({ count?, seed? })`, `submitCalibration({ ranking })`,
  `rescoreCalibration()`
- `listArrivals()`, `recordVerdict({ postingId, label })`, `verdictSummary()`
- `explainPosting({ postingId })`, `previewPosting({ postingId })`
- `probeCompany`, `addCompany`, `removeCompany`, `listWatchlist`
- `getProfile`, `updateProfile`, `listPostings`, `readPosting`, `rubric()`

MCP handlers and CLI commands call these and render; neither reads a
directory, builds a judge prompt, or decides an order.

### Stable posting IDs

A posting's ID is its cache filename stem (`langchain-0a5dd30c-...`), not the
filename. Ledger entries, traces, calibrations, preferences, the MCP tools,
and the CLI all speak IDs. The filesystem adapter maps ID to file. Ledgers and
preferences written before this change keyed on filenames and are normalized
on read, so existing state survives. On input, a `.txt` suffix is accepted and
stripped. On read, an ID is checked against the cache-ID alphabet
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`) before any filesystem access; anything else is
a miss and cannot name a file outside the postings directory.

### Boundaries validated at runtime

- Judge responses: a runtime schema requires the hard blocker and every
  dimension with a score on that dimension's criteria ladder (0 to the last
  rung) and a confidence in 0..1. A malformed answer fails that posting loudly
  rather than being clamped.
- Watchlist entries and preferences: invalid entries are dropped, not trusted.
- The ledger: a corrupt ledger refuses the whole-cache run with
  `LEDGER_UNREADABLE` before any judge call and is never overwritten. Triage
  by explicit posting ID neither reads nor marks the ledger, so it still works.

### Determinism

- Calibration draws use a seeded random source; the seed is recorded with the
  pending slice, and `--seed` redraws it.

### Errors

Use cases throw `ApplicationError` with a stable code (`NO_JUDGE`,
`NO_PROFILE`, `EMPTY_WATCHLIST`, `NOTHING_TO_SCORE`, `NO_PREFERENCES`,
`POSTING_NOT_FOUND`, `INVALID_RANKING`, `NO_PENDING_CALIBRATION`,
`NO_CALIBRATION_HISTORY`, `INVALID_COMPANY`). Surfaces render the message; the
MCP contract maps the codes to protocol errors
([`specs/mcp-contract.md`](./mcp-contract.md)).

### Surfaces

- The `fish` CLI is the blessed interface: `fetch`, `triage`, `evaluate`,
  `calibrate start|submit|reuse|rescore`, `watchlist list|probe|add|remove`,
  `profile get|set`, `postings list|read|explain`, plus `arrivals` for
  grading ([`specs/quality.md`](./quality.md)).
- `postings explain` returns the raw typed answers and cost for one posting;
  `--dry-run` prints the request without sending it. `calibrate reuse` redraws
  the pending slice from its recorded seed.
- The MCP server (`fish-career` over stdio) and the CLI are thin surfaces over
  one application core; a score means the same thing however it was asked for.

### Trace record

Every judge call writes one record with:

- `at` (ISO timestamp), `runId`, `postingId`, `postingHash`
- `status`, `latencyMs`, `attempts` (retry count)
- `inputTokens`, `outputTokens`, `model`
- `profileHash`, `rubric`, `version` (application version)
- `answers` on success or `error` on failure

One `runId` is generated per scoring call (triage, evaluation, calibration,
explain), so every trace can be read back as a run. The run ID is returned by
`rankPostings` and surfaced by the `triage_postings` tool and `fish triage`.

### Trace readers

`TraceReader` exposes `recent(limit)`, `byRun(runId)`, and `latestRun()`, so a
resource can read a run without knowing the storage format.

### Trace sinks

- The JSONL sink is always written; it is the local source of truth and the
  replay format.
- `FISH_TRACE=langsmith` with `LANGSMITH_API_KEY` (and optional
  `LANGSMITH_PROJECT`, default `fish-career`) fans the same records out to
  LangSmith's `/runs` ingestion endpoint with the model, attempts, tokens,
  application version, and run ID as metadata.
- A telemetry sink never fails a scoring run: LangSmith write errors are
  reported through an `onError` callback and swallowed, while the JSONL write
  is allowed to fail loudly.

### Trace resources

`fish://runs/latest` returns the most recent run (`{ runId, records }`) and
`fish://runs/{runId}` returns one run by ID; an unknown run is a
protocol-level not-found.

## Non-goals

- No scraping LinkedIn, no auto-applying, no multi-candidate profiles.
- No MCP App UI yet; the ranked table is text until the App plane exists.
- No LLM-authored prose in the ranking path. Typed answers only.
- No OpenTelemetry adapter yet; the port is the seam for it.
- No sampling or redaction of trace answers; a deployment that needs either
  should wrap the sink.
- No remote trace storage as the source of truth.
- No change to scoring math, rubric data, ranking rules, or fetch semantics.
- No hosted or multi-user concerns.

## Acceptance

- `npm --prefix fish-career test` green, including the golden eval slice, a
  complete-workflow test over in-memory ports with `fetch` stubbed to throw,
  and the trace tests below.
- `fish evaluate` reports every revealed preference satisfied.
- Every scored row is reproducible from `state/traces.jsonl`.
- The I/O boundary, scoped to shipped source. No non-test file under
  `src/domain` or `src/application` imports an I/O builtin (`node:fs`,
  `node:child_process`, `node:net`, `node:http`, `node:http2`, `node:https`,
  `node:tls`, `node:dns`, `node:dgram`, `node:worker_threads`,
  `node:module`) or calls `fetch`; no non-test file under `src/interfaces`
  calls `fetch`; no non-test file under `src/interfaces/mcp` imports one of
  those builtins; under `src/`, `fetch` appears only in non-test files under
  `src/adapters`. `src/interfaces/cli` is the process edge, and a non-test
  file there may import `node:fs` for a user-named file and bundled package
  data; personal state still travels only through ports.
  `fish-career/scripts/check-boundaries.mjs` enforces this over `.ts`, `.mts`,
  and `.cts` files, and `npm --prefix fish-career run health` runs it.
- Test files are out of scope of that rule and may import those builtins
  freely: they are excluded from the build (`tsconfig.build.json`) and from
  the package (`files`), and the invariant is about the runtime boundary. The
  dependency allowlist in the same check still covers every file, tests
  included.
- Trace acceptance: `score-postings` tests assert one run ID across a run's
  traces and the presence of `postingHash`, `attempts`, `version`, and the
  model; reader tests cover `recent`, `byRun`, `latestRun`, malformed lines,
  and an empty file; sink tests assert the LangSmith request shape and that a
  network failure or non-2xx is reported and swallowed; the protocol test
  reads `fish://runs/{runId}` from the run ID the triage returned and rejects
  an unknown run.
