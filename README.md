# fish.career

[![test](https://github.com/pblittle/fish-career/actions/workflows/test.yml/badge.svg)](https://github.com/pblittle/fish-career/actions/workflows/test.yml)

> fish.career is a local-first MCP server that finds job opportunities,
> interprets their fit, scores them with an explicit rubric, and hones that
> rubric against human judgment.

**F**ind opportunities on the public ATS boards you choose. **I**nterpret
titles, locations, compensation, and requirements into one normalized shape.
**S**core them with a versioned decision rubric. **H**one that rubric against
blind human ranking and reproducible evaluation.

The scarce resource is your attention. The pipeline's job is to turn an
unbounded stream of postings into a small ranked table with the reasons
attached, and to prove measurably that the ranking tracks your own judgment
rather than a model's taste. Everything below serves that.

- Product boundary and repository strategy: [`docs/adr/0001-product-boundary.md`](./docs/adr/0001-product-boundary.md)
- Architecture and the decisions behind it: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Pipeline contract: [`specs/0001-posting-pipeline.md`](./specs/0001-posting-pipeline.md)

## See it work

The demo runs the real pipeline—fetch, triage, evaluate, calibrate—over
bundled fixtures with **no API key and no network**, in a temp directory that
is removed afterwards:

```bash
npm ci --prefix fish-career
npm run build --prefix fish-career
node fish-career/dist/index.js demo
```

It prints a ranked table, holds the ranking to the fixture profile's stated
preferences, and compares a blind human ranking against the judge. The judge
in the demo is a documented stand-in (`src/fake-judge.ts`), not a model; the
demo says so in its first lines.

## Five-minute setup

### 1. Install

Requires Node 20.12+. The package is `fish-career`; `npx -y fish-career`
works once the first npm release lands, and the source install below is
identical:

```bash
git clone https://github.com/pblittle/fish-career.git
cd fish-career
npm ci --prefix fish-career
npm run build --prefix fish-career
```

### 2. Connect your MCP host

The server speaks MCP over stdio. State lives outside the package in
`FISH_HOME` (default `~/.config/fish`). Claude Desktop:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/fish-career/fish-career/dist/index.js"],
      "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
    }
  }
}
```

Host-specific notes: [Claude Desktop](./docs/hosts/claude-desktop.md) ·
[opencode](./docs/hosts/opencode.md) · [Cursor](./docs/hosts/cursor.md).

### 3. Give it a profile

The profile is the judgment target: every score is made against it, and it is
sent verbatim to the judge on scoring calls. Ask your host to run
`update_profile`, or write `$FISH_HOME/profile.md` directly. A skeleton:

```markdown
# Candidate profile

Target roles: what you want to do, and what you are done doing.
Level: the seat you are looking for, and the one above it you would take.
Location and remote: your constraint, stated as a rule.
Compensation floor: $NNN,NNN.
Core skills: the things you have used in depth.
Domains I want: the fields worth your next five years.
Hard constraints: anything a posting must not violate.
```

The profile's accuracy bounds everything downstream. A vague line produces a
low-confidence judgment, and the table marks those cells with `?`.

### 4. Watch companies

Ask the host to `watchlist_add` with a company name and a candidate slug.
The first call probes all four public ATS APIs and writes nothing; read a
title or two from the board it finds, then call again with `confirm=true` to
write the entry. Slugs collide—verifying identity is the point of the split.
`watchlist_list` shows what you are watching.

### 5. Fetch and triage

`fetch_postings` polls every watched board, keeps remote postings, writes the
arrivals you have never seen, and returns the diff. `triage` scores them
against the profile with the judge and returns the ranked table with
per-dimension scores, confidences, and blocker flags. Triage needs a TypeSafe
API key in `$FISH_HOME/.env`:

```text
TYPESAFE_API_KEY=...
```

Key from <https://console.typesafe.ai/keys>.

### 6. Calibrate against yourself

The ranking is only as good as its agreement with you. `calibrate_start`
draws a slice of cached postings and hands them over numbered. Rank them by
your own judgment, best first, **before** reading any score, then call
`calibrate_submit` with that order. You get Spearman agreement and the
biggest disagreements, with the dimension cells that drove each one. Adjust
weights or profile lines, then `calibrate_rescore` re-measures the same slice
under the new rubric.

`evaluate` is the cheaper measurement: it holds the ranking to pairwise
preferences your profile already states (`$FISH_HOME/preferences.json`), each
quoting its source line. Run it after any profile or weight change.

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
`fish://rubric/current`, `fish://calibrations/latest`, `fish://runs/latest`.

**Prompts**: `career-search-onboarding`, `review-new-arrivals`,
`explain-ranking`, `calibrate-rubric`, `audit-profile`.

Every tool result carries `structuredContent` that validates against its
declared output schema, plus a text rendering for chat hosts. Expected
failures return `isError: true` with a stable code
(`NO_PROFILE`, `NOTHING_TO_SCORE`, `POSTING_NOT_FOUND`, ...) and a hint.
Upgrading from the 0.4 tool names:
[`docs/mcp-migration.md`](./docs/mcp-migration.md).

## The command line

The same use cases are available as `fish`, which is what the scripts below
call. `fish` with no arguments starts the MCP server.

```bash
fish demo [--keep]                          # the credential-free demo
fish fetch [--company X] [--days N] [--all] # poll and write arrivals
fish triage [--rescore] [postingId...]      # score and rank
fish evaluate                               # hold the ranking to your preferences
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

- **One application core, many surfaces.** MCP handlers and CLI commands call
  the same use cases; neither reads a directory, builds a judge prompt, or
  decides an order. The demo runs the whole workflow through in-memory
  adapters, which is what proves the core has no hidden filesystem, network,
  or clock dependency.
- **The judge is untrusted.** One request per posting: five typed Score
  dimensions plus one Noul hard-blocker check, not prose to be parsed for
  sentiment. Responses are validated against a runtime schema at the adapter
  boundary; a malformed answer fails that posting loudly instead of being
  clamped into a score nobody can explain.
- **Judgment is data.** Weights, criteria, and blocker instructions live in
  `DIMENSIONS` in `src/domain/rubric.ts` with a `RUBRIC_VERSION`, where a
  change is a reviewable diff.
- **Every score carries provenance.** Each ledger entry records the profile
  hash and rubric version that produced it. Change either and stale entries
  re-score on the next run.
- **Stable posting IDs.** A posting's ID is its cache filename stem, and every
  ledger entry, trace, calibration, and tool speaks IDs. Storage layout is an
  adapter detail.
- **A blocker demotes.** A posting naming a hard requirement you cannot meet
  is not the top row whatever its composite, and it says so in the table.
- **Variants collapse.** One region-labelled vacancy posted per office is one
  row that names the other offices. A bare base title stays its own row.
- **Arrivals only.** Every remote posting a poll observes is marked seen,
  written or not; later polls deliver the diff.

## Privacy and data flow

Everything the server reads and writes hangs off `FISH_HOME`; the npm package
holds none of it. The only outbound calls are GETs to the four public ATS APIs
and the judge call, which sends your profile and the posting text to TypeSafe.
There is no telemetry, no analytics, and no account. Details and the threat
model: [`docs/privacy.md`](./docs/privacy.md).

Personal state can live in a private checkout—the public repository ships
fixtures and examples only. Point `FISH_HOME` at it and keep profile,
watchlist, postings, and calibrations out of any public tree.

## Known limits

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
npm run lint --prefix fish-career       # biome
npm run lint:md --prefix fish-career    # markdownlint
npm run verify:pack --prefix fish-career
npm run smoke --prefix fish-career      # stdio contract smoke on the built server
node fish-career/dist/index.js demo
```

Behavior changes land with a spec in [`specs/`](./specs) and significant
architecture decisions with an ADR in [`docs/adr/`](./docs/adr). Releases are
cut by release-please from conventional commits; see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
