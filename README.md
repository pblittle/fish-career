# fish.career

[![test](https://github.com/pblittle/fish-career/actions/workflows/test.yml/badge.svg)](https://github.com/pblittle/fish-career/actions/workflows/test.yml)

fish.career is a local-first MCP server that finds job opportunities,
interprets their fit, scores them with an explicit rubric, and hones that
rubric against human judgment.

The scarce resource is your attention. Job boards optimize for the opposite:
an unbounded feed, ranked by signals you cannot see and cannot argue with.
fish.career turns that stream into a small ranked table with the reasons
attached, and measures whether the ranking tracks your own judgment rather
than a model's taste.

## Why this exists

A ranking is not useful until you can explain it, reproduce it, and test it
against the decisions it is supposed to support. Most tools fail all three:
the ordering is opaque, it shifts when the model shifts, and nothing measures
whether it agreed with you.

fish.career takes the three claims seriously.

- **Explain it.** Every score is a weighted composite of five named
  dimensions plus a separate hard-blocker check. Any cell can be read back
  with the profile line and rubric version that produced it, and a
  low-confidence judgment shows as `?` instead of a confident-looking number.
- **Reproduce it.** Weights and criteria live in versioned code
  (`RUBRIC_VERSION`), not a prompt. Same postings, same profile, same rubric
  version, same ranking. Calibration draws are seeded and replayable.
- **Test it.** `calibrate` measures the ranking against your own blind order.
  `quality` grades it against a labeled dataset, and a rubric change that
  moves the metrics fails CI until the baseline is re-recorded on purpose.

## How it works

```text
MCP over stdio ──┐
CLI ─────────────┼── CareerApplication (src/application)
Future hosted ───┤         │
Future API ──────┘         │
            ┌──────────────┼──────────────┐
            │              │              │
       ATS providers     Judge      Repositories,
       (ports)           (port)     ledger, traces
            │              │              │
      adapters/ats   adapters/judge  adapters/filesystem
```

- **One application core, many surfaces.** The MCP server and the `fish` CLI
  call the same use cases; neither reads a directory, builds a judge prompt,
  or decides an order. The demo runs the whole workflow over in-memory
  adapters, which is what proves the core has no hidden filesystem, network,
  or clock dependency.
- **The judge is untrusted.** One request per posting: five typed Score
  dimensions plus one hard-blocker check, not prose to be parsed for
  sentiment. Responses are validated against a runtime schema at the adapter
  boundary; a malformed answer fails that posting loudly instead of being
  clamped into a score nobody can explain.
- **Judgment is data.** Weights, criteria, and blocker instructions live in
  `DIMENSIONS` in `src/domain/rubric.ts` with a `RUBRIC_VERSION`, where a
  change is a reviewable diff.
- **Every score carries provenance.** Each ledger entry records the profile
  hash and rubric version that produced it. Change either and stale entries
  re-score on the next run.
- **A blocker demotes.** A posting naming a hard requirement you cannot meet
  is not the top row whatever its composite, and it says so in the table.
- **Variants collapse, arrivals only.** One region-labelled vacancy posted
  per office is one row naming the other offices. Every posting a poll
  observes is marked seen, written or not, so later polls deliver the diff.

## Quickstart

Requires Node 20.12+. The package is not on npm yet, so install from source:

```bash
git clone https://github.com/pblittle/fish-career.git
cd fish-career
npm ci --prefix fish-career
npm run build --prefix fish-career
```

See the whole pipeline run over bundled fixtures with no API key, no network,
and no user state, in a temp directory it removes afterwards:

```bash
node fish-career/dist/index.js demo
```

The demo prints a ranked table, holds the ranking to the fixture profile's
stated preferences, and compares a blind human order against the judge. The
judge in the demo is a documented stand-in (`src/adapters/judge/fake.ts`), not
a model, and the demo says so in its first lines.

Point a host at the server by adding it to your MCP config. Claude Desktop:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/repo/fish-career/dist/index.js"],
      "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
    }
  }
}
```

`/absolute/path/to/repo` is the clone; `fish-career/` is the package directory
inside it. Host notes: [Claude Desktop](./docs/hosts/claude-desktop.md) ·
[opencode](./docs/hosts/opencode.md) · [Cursor](./docs/hosts/cursor.md). The
walkthrough that follows (profile, watchlist, fetch and triage, calibrate) is
in [`docs/getting-started.md`](./docs/getting-started.md).

## The MCP surface

Ten action tools, each with an input schema, an output schema, safety
annotations, and structured results. Passive state lives in resources, and
the workflows ship as prompts.

| Tool | Purpose | Safety |
|---|---|---|
| `watchlist_probe` | Probe the four public ATS boards for a company slug | read-only |
| `watchlist_add` | Write a verified company | additive, idempotent |
| `watchlist_remove` | Remove a company | destructive |
| `fetch_postings` | Poll watched boards, write unseen remote postings | open-world |
| `triage_postings` | Score postings, return the ranked table | writes ledger + traces |
| `evaluate_ranking` | Hold the ranking to the profile's stated preferences | measurement |
| `calibration_start` | Draw a seeded blind slice | local write |
| `calibration_submit` | Record your order, score the slice, measure agreement | judge call |
| `calibration_rescore` | Re-measure the last slice under the current rubric | judge call |
| `profile_update` | Replace the candidate profile | destructive |

**Resources** (`resources/read`): `fish://profile/current`,
`fish://watchlist`, `fish://postings`, `fish://postings/{postingId}`,
`fish://rubric/current`, `fish://calibrations/latest`, `fish://runs/latest`,
`fish://runs/{runId}`.

**Prompts**: `career-search-onboarding`, `review-new-arrivals`,
`explain-ranking`, `calibrate-rubric`, `audit-profile`.

Every tool result carries `structuredContent` that validates against its
declared output schema, plus a text rendering for chat hosts. Expected
failures return `isError: true` with a stable code (`NO_PROFILE`,
`NOTHING_TO_SCORE`, `POSTING_NOT_FOUND`, ...) and a hint. Upgrading from the
0.4 tool names: [`docs/mcp-migration.md`](./docs/mcp-migration.md).

## The command line

The same use cases are available as `fish`, which is what the scripts below
call. `fish` with no arguments starts the MCP server.

```bash
fish demo [--keep]                          # the credential-free demo
fish fetch [--company X] [--days N] [--all] # poll and write arrivals
fish triage [--rescore] [postingId...]      # score and rank
fish evaluate                               # hold the ranking to your preferences
fish quality [--k N] [--json]               # ranking quality against the labeled dataset
fish calibrate start [--count N] [--seed N] # draw a blind slice
fish calibrate submit <postingId...>        # record your order, measure agreement
fish calibrate reuse                        # redraw the slice from its seed
fish calibrate rescore                      # re-measure under the current rubric
fish watchlist list | probe <slug> | add <name> <provider> <slug> | remove <name>
fish profile get | set <path>
fish postings list | read <postingId> | explain <postingId> [--dry-run]
```

From a source checkout, run it as `node fish-career/dist/index.js <command>`
or link it (`npm --prefix fish-career link`). The root `fetch.mjs`,
`triage.mjs`, and `probe-boards.mjs` are shims over these commands and keep
their old `FISH_HOME` default.

## Ranking quality

`evaluate` checks the ranking against constraints the profile states.
`calibrate` measures it against one blind human ranking. `quality` is the
standing measurement: 17 labeled postings, graded 0-3 with a note on each,
covering the hard cases (on-site and hybrid blockers, out-of-geography
remote, overqualification, missing compensation, ambiguous location,
duplicate regional listings, an adversarial posting, a too-thin posting).

```bash
fish quality            # deterministic, offline, no API key
```

Against the recorded baseline: pairwise accuracy 92.3%, Kendall tau 73.7%,
Spearman 86.3%, precision@5 100%, nDCG@5 98.4%, every blocked posting below
every clean one, and a top five that survives a 20% bump to any single
dimension weight. The disagreements are as useful as the hits: the report
names the junior seat the level ladder over-rewards and the management role
the composite still surfaces. Read it in full:
[`docs/quality-report.md`](./docs/quality-report.md).

The metrics are a golden fixture. A rubric change that moves them fails CI
until `eval/expected-metrics.json` is updated deliberately, and
`npm --prefix fish-career run record:eval` re-records the baseline from a
live judge run.

## Privacy and data flow

Everything the server reads and writes hangs off `FISH_HOME`; the npm package
holds none of it. The only outbound calls are GETs to the four public ATS APIs
and the judge call, which sends your profile and the posting text to TypeSafe.
There is no telemetry, no analytics, and no account. Optionally, setting
`FISH_TRACE=langsmith` with a key mirrors each judge call to LangSmith
(posting IDs, hashes, model, tokens, and typed answers; never the posting or
profile text) while the local JSONL trace stays the source of truth.
Details and the threat model: [`docs/privacy.md`](./docs/privacy.md).

Personal state can live in a private checkout. The public repository ships
fixtures and examples only; point `FISH_HOME` at a private tree and keep
profile, watchlist, postings, and calibrations out of any public one.

## Known limits

- The package is not on npm yet. Until it is, install from source.
- Greenhouse boards carry no compensation data, so the comp dimension reads
  neutral there; sub-floor Greenhouse postings can slip past the comp gate and
  should be eyeballed at the top of the table.
- US eligibility is not filtered at fetch; it lives in posting text and is
  judged by the location dimension and the blocker check.
- Ashby compensation ranges arrive as written by the employer, unverified.
- The judge's calibration on job postings is unknown until the first
  calibration run; treat early rankings as a measurement, not a verdict.
- One profile per `FISH_HOME`. No auto-applying, no authenticated scraping,
  no LinkedIn.

## Development

```bash
npm ci --prefix fish-career
npm test --prefix fish-career          # vitest; deterministic, no network
npm run typecheck --prefix fish-career
npm run lint --prefix fish-career      # biome
npm run lint:md --prefix fish-career   # markdownlint
npm run verify:pack --prefix fish-career
npm run smoke --prefix fish-career     # stdio contract smoke on the built server
npm run quality --prefix fish-career   # ranking quality report, offline
node fish-career/dist/index.js demo
```

Behavior changes land with a spec in [`specs/`](./specs) and significant
architecture decisions with an ADR in [`docs/adr/`](./docs/adr). The
architecture and its reasons: [`ARCHITECTURE.md`](./ARCHITECTURE.md). The
product boundary and repository strategy:
[`docs/adr/0001-product-boundary.md`](./docs/adr/0001-product-boundary.md).
The pipeline contract:
[`specs/0001-posting-pipeline.md`](./specs/0001-posting-pipeline.md). Releases
are cut by release-please from conventional commits; see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Naming

The name is the domain: `fish.career`, where the dot replaces the dash and
becomes the real TLD. The engine and the package are `fish-career`; the
command is `fish`.

## License

MIT. See [LICENSE](./LICENSE).
