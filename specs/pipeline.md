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
  otherwise writes `not stated`. A lone figure is never lifted. `URL` is the
  page a person opens, never the API's JSON: a SmartRecruiters list entry
  carries only its API link, so its `URL` is built from the company and the
  posting id.
- Remote postings only. Every observed remote posting is marked seen, written
  or not, unless its title is on the skip list; later polls deliver arrivals
  only. A recency window applies on the first poll (or an explicit `--days`).
  An explicit window (`--days N`, or `--all` for none) also reconsiders every
  posting a poll observed and never wrote, except one too thin to score: those
  dropped out of window, and those from before fish recorded why. Each keeps
  its first-observation time.
- Remote is the provider's stated workplace type where it has one (Ashby and
  Lever `workplaceType`, SmartRecruiters `location.remote` and
  `location.hybrid`). Without one, a Greenhouse or Lever posting falls back to
  its location text, where "Remote" or "Distributed" (Cloudflare's term for
  anywhere in the country of employment) counts as remote, and an Ashby
  posting to its `isRemote` flag. Every adapter returns every posting with its
  workplace; fetch keeps the remote ones, so a hybrid or on-site posting is
  counted as a not-remote drop on every board. `PUBLISHED` is first
  publication (Greenhouse `first_published`), not the last edit, so the
  recency window measures when a posting went up.
- Titles the operator never wants fetched are phrases in
  `$FISH_HOME/skip-titles.txt`, one per line, with `#` comments. A phrase
  matches when its words appear in the title side by side and in order, whole
  words in any case (`offTargetPhrase` in `src/domain/skip-titles.ts`). After
  the remote check and before admission, fetch sets aside an unseen posting
  whose title matches: it costs no detail fetch, counts as an off-target drop,
  and is never marked seen, so deleting the phrase lets the next poll admit
  it. The list applies when fetch writes; a posting already in the cache
  stays, and triage scores it. A missing file skips nothing; a file that
  cannot be read fails the fetch.
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
src/domain        pure policy: posting, posting URLs, rubric, answers,
                  ranking, preferences, calibration, ledger, admission,
                  skip titles, verdicts, metrics, quality, random, errors
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
- `listArrivals()`, `recordVerdict({ postingId, label })`, `verdictSummary()`,
  `recallPostings({ urls })`
- `explainPosting({ postingId })`, `previewPosting({ postingId })`
- `probeCompany`, `addCompany`, `addCompanyFromUrl`, `removeCompany`,
  `listWatchlist`
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

### Posting URLs

`parsePostingUrl` (`src/domain/posting-url.ts`) reads a pasted URL offline
and says what it names:

- A posting or a board on one of the four providers, in the forms their
  boards, embeds, and APIs use. A posting carries the key its adapter writes.
- A Greenhouse job on the employer's own site (`?gh_jid=`). Greenhouse job
  IDs are global, so it matches that job on any watched Greenhouse board, but
  the URL does not name the board.
- A system fish has no adapter for (Workday, iCIMS, and the rest of
  `OTHER_SYSTEMS`), a job search site (`AGGREGATORS`), or nothing it knows.

A slug keeps the spelling its URL gives it. Slugs compare URL-decoded, and
case-blind on every provider but Lever: on 2026-10-03 Lever answered
"Document not found" for `Vida` and listed 14 postings for `vida`, while
Ashby, Greenhouse, and SmartRecruiters answered either case alike.
`src/fixtures/posting-urls.json` holds real URLs with the parse each must
get, and the adapter tests parse every URL an adapter writes back to the key
it wrote, so the parser and the key formats cannot drift apart.

The watchlist takes a posting or board URL as well as a provider and slug,
and a name defaults to the slug. One name is one entry and one board is one
entry, so adding either again is a no-op that returns the entry already
watched.

### Boundaries validated at runtime

- Judge responses: a runtime schema requires the hard blocker and every
  dimension with a score on that dimension's criteria ladder (0 to the last
  rung) and a confidence in 0..1. A malformed answer fails that posting loudly
  rather than being clamped.
- Watchlist entries and preferences: invalid entries are dropped on read, not
  trusted. The watchlist store never writes over a file that holds entries it
  dropped or could not parse; an add or remove refuses until the file is fixed.
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
  grading and `recall` for postings found elsewhere
  ([`specs/quality.md`](./quality.md)).
- `triage` exits non-zero when no posting could be scored; a partial run
  prints its failures and exits zero, because its rows are already persisted.
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
