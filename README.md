# fish.career

[![test](https://github.com/pblittle/fish-career/actions/workflows/test.yml/badge.svg)](https://github.com/pblittle/fish-career/actions/workflows/test.yml)

fish.career is local-first job search: an MCP server and CLI that rank postings
against your profile, explain every score, and measure the ranking against your
own judgment.

The scarce resource is your attention. Job boards optimize for the opposite:
an unbounded feed, ranked by signals you cannot see and cannot argue with.
fish.career turns that stream into a small ranked table with the reasons
attached, and proves measurably that the ordering tracks your judgment rather
than a model's taste.

## Proof

The ranking is measured, not asserted. [`fish-career/eval/`](./fish-career/eval)
holds 17 labeled postings covering the hard cases, a recorded judge run, and
golden metrics: pairwise accuracy 92.3%, Kendall tau 73.7%, Spearman 86.3%,
precision@5 100%, nDCG@5 98.4%, with every blocked posting below every clean
one. `fish quality` reproduces the report offline. The findings — including
where the ranking still disagrees with the operator — are in
[`specs/quality.md`](./specs/quality.md).

[`examples/langgraph/`](./examples/langgraph) runs the same application API
(fetch, triage, a human-review interrupt, an optional re-measure) under
LangGraph. The ranking engine never imports it.

## Quickstart

Requires Node 20.12+. The package is not on npm yet, so install from source:

```bash
git clone https://github.com/pblittle/fish-career.git
cd fish-career
npm ci --prefix fish-career
npm run build --prefix fish-career
```

Link the CLI once so the bare `fish` name exists
(`npm --prefix fish-career link`), then drive the loop:

```bash
fish profile set <path>                      # the judgment target; see the walkthrough
fish watchlist probe <slug>                  # read a title or two; slugs collide
fish watchlist add "Company" <provider> <slug>
fish watchlist add <posting-url>             # or any posting or board URL on it
fish fetch
fish triage
```

Scoring needs a TypeSafe API key in `$FISH_HOME/.env`:

```text
TYPESAFE_API_KEY=...
```

Keys come from <https://console.typesafe.ai/keys>. No key yet? Put
`FISH_JUDGE=fake` in the same file and the deterministic stand-in
([`src/adapters/judge/fake.ts`](./fish-career/src/adapters/judge/fake.ts))
answers the same typed questions, so the whole loop runs before you spend
anything.

## Connect a host

Claude Desktop reads `claude_desktop_config.json`: macOS
`~/Library/Application Support/Claude/claude_desktop_config.json`, Windows
`%APPDATA%\Claude\claude_desktop_config.json`, Linux
`~/.config/Claude/claude_desktop_config.json`.

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
inside it; `FISH_HOME` holds profile, watchlist, postings, and state.

Cursor reads `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)
with the same `mcpServers` shape as above. opencode reads `opencode.json`
(project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "fish-career": {
      "type": "local",
      "command": ["node", "/absolute/path/to/repo/fish-career/dist/index.js"],
      "enabled": true,
      "environment": { "FISH_HOME": "/absolute/path/to/fish-state" }
    }
  }
}
```

Restart the host, then ask it to read the `fish://profile/current` resource.
Before a profile exists the server answers that there is none at
`$FISH_HOME/profile.md`; that is the server working. Once the package is
published, the npm entry is the same shape with `"command": "npx"` and
`"args": ["-y", "fish-career"]` for Claude Desktop and Cursor, and a single
`"command": ["npx", "-y", "fish-career"]` for opencode.

**Optional: a web search companion.** fish reads only the boards you watch.
To find boards worth watching, give the host a search server next to fish and
let it hand posting URLs to `watchlist_add`. Firecrawl's MCP server is one;
it needs its own key from <https://www.firecrawl.dev>:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/repo/fish-career/dist/index.js"],
      "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "fc-..." }
    }
  }
}
```

fish's own outbound calls do not change: the URL is read offline, and fish
never calls Firecrawl. The host's search queries and the pages it scrapes go
to Firecrawl under Firecrawl's terms, so keep personal details out of what
you ask the host to search.

## The walkthrough

Every step has an MCP tool; the tool names appear in each section. Ask your
host for the tool by name if you would rather stay in chat.

### 1. Give it a profile

The profile is the judgment target: every score is made against it, and it is
sent verbatim to the judge on scoring calls. Ask your host to run
`profile_update`, or write `$FISH_HOME/profile.md` directly. A skeleton:

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

### 2. Watch companies

Ask the host to run `watchlist_probe` with a candidate slug, read a title or
two from the board it finds, then run `watchlist_add` to write the entry. The
probe writes nothing, which is the point: slugs collide, and verifying
identity before writing is the split. A posting URL skips the guess: any
posting or board URL on Ashby, Greenhouse, Lever, or SmartRecruiters names
the board, so `watchlist_add` takes one in place of a provider and slug. A
URL on another system (Workday, iCIMS, and others) or a job search site
(HiringCafe, LinkedIn, Indeed) is refused with the reason.

```bash
fish watchlist probe <slug>
fish watchlist add "Company" <provider> <slug>
fish watchlist add <posting-or-board-url> ["Company"]
fish watchlist list
```

### 3. Fetch and triage

```bash
fish fetch     # poll every watched board, keep remote postings, write arrivals
fish triage    # score the arrivals, print the ranked table
```

`fetch` polls the watched boards, keeps remote postings, writes the arrivals
you have never seen, and returns the diff. It also reports why postings were
dropped: not remote, too thin to score, out of window. The out-of-window
bucket only fires on the first poll, which defaults to the last 14 days, or
when you pass `--days`; after that a remote posting is dropped on first
contact or never. `triage` scores the arrivals against the profile with the
judge and prints per-dimension scores, confidences, and blocker flags. Over
MCP, the tools are `fetch_postings` and `triage_postings`.

### 4. Grade arrivals

The strongest measurement is your own verdict on what fetch actually wrote.
`fish arrivals` lists what is still ungraded; grade each one on the eval's
scale: 3 act on it now, 2 worth a look, 1 a miss, 0 should not surface.

```bash
fish arrivals
fish arrivals grade <postingId> 2
fish arrivals summary
```

`summary` reports coverage and precision@arrival (the share of graded
arrivals you called worth a look or better) with a Wilson 95% interval, and
says "no read" below the floor rather than pretending. Re-grading replaces the
earlier verdict; provenance (profile hash, rubric, time) is recorded for
reproducibility but a profile change never invalidates a human judgment. The
grades live in `$FISH_HOME/state/verdicts.json` and stay out of the `quality`
golden metrics. Over MCP, the tool is `verdict_record`.

### 5. Calibrate against yourself

The ranking is only as good as its agreement with you. `calibration_start`
draws a slice of cached postings and hands them over numbered. Rank them by
your own judgment, best first, **before** reading any score, then submit that
order:

```bash
fish calibrate start --count 8
fish calibrate submit <postingId> <postingId> ...
```

You get Spearman agreement and the biggest disagreements, with the dimension
cells that drove each one. Adjust weights or profile lines, then
`fish calibrate rescore` re-measures the same slice under the new rubric, and
`fish calibrate reuse` redraws the pending slice from its recorded seed.

`fish evaluate` is the cheaper measurement: it holds the ranking to pairwise
preferences your profile already states (`$FISH_HOME/preferences.json`), each
quoting its source line. Run it after any profile or weight change.

## Why this exists

A ranking is not useful until you can explain it, reproduce it, and test it
against the decisions it is supposed to support. Most tools fail all three:
the ordering is opaque, it shifts when the model shifts, and nothing measures
whether it agreed with you.

fish.career takes the three claims seriously.

- **Explain it.** Every score is a weighted composite of five named dimensions
  plus a separate hard-blocker check. Any cell can be read back with the
  profile line and rubric version that produced it, and a low-confidence
  judgment shows as `?` instead of a confident-looking number.
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
  or decides an order. The test suite runs the whole workflow over in-memory
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
- **Variants collapse, arrivals only.** One region-labelled vacancy posted per
  office is one row naming the other offices. Every remote posting a poll
  observes is marked seen, written or not, so later polls deliver the diff.

The architecture and its reasons: [`ARCHITECTURE.md`](./ARCHITECTURE.md). The
contracts: [`specs/pipeline.md`](./specs/pipeline.md) for the engine,
[`specs/quality.md`](./specs/quality.md) for the measurements,
[`specs/mcp-contract.md`](./specs/mcp-contract.md) for the protocol surface.

## The MCP surface

Eleven tools, each with an input schema, an output schema, safety annotations,
and structured results. Passive state lives in resources, and the workflows
ship as prompts.

| Tool | Purpose | Safety |
|---|---|---|
| `watchlist_probe` | Probe the four public ATS boards for a company slug | read-only |
| `watchlist_add` | Write a company's board, from a posting URL or a probed slug | additive, idempotent |
| `watchlist_remove` | Remove a company | destructive |
| `fetch_postings` | Poll watched boards, write unseen remote postings | open-world |
| `verdict_record` | Record your grade for a cached arrival | latest-wins replace, idempotent |
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
`NOTHING_TO_SCORE`, `POSTING_NOT_FOUND`, ...) and a hint. The full contract
and the complete code list:
[`specs/mcp-contract.md`](./specs/mcp-contract.md).

## The command line

The same use cases are available as `fish`, which is what the scripts below
call. `fish` with no arguments starts the MCP server.

```bash
fish fetch [--company X] [--days N] [--all] # poll, write arrivals, report drops
fish arrivals [grade <postingId> <0|1|2|3> | summary] # grade arrivals, report precision
fish recall <url...>                        # how far postings found elsewhere got
fish triage [--rescore] [postingId...]      # score and rank
fish evaluate                               # hold the ranking to your preferences
fish quality [--k N] [--json]               # ranking quality against the labeled dataset
fish calibrate start [--count N] [--seed N] # draw a blind slice
fish calibrate submit <postingId...>        # record your order, measure agreement
fish calibrate reuse                        # redraw the slice from its seed
fish calibrate rescore                      # re-measure under the current rubric
fish watchlist list | probe <slug> | add <url> [name] | add <name> <provider> <slug> | remove <name>
fish profile get | set <path>
fish postings list | read <postingId> | explain <postingId> [--dry-run]
```

From a source checkout, run it as `node fish-career/dist/index.js <command>`
or link it (`npm --prefix fish-career link`).

## Ranking quality

`evaluate` checks the ranking against constraints the profile states.
`calibrate` measures it against one blind human ranking. `quality` is the
standing measurement: 17 labeled postings, graded 0-3 with a note on each,
covering the hard cases (on-site and hybrid blockers, out-of-geography
remote, overqualification, missing compensation, ambiguous location,
duplicate regional listings, an adversarial posting, a too-thin posting). The
recorded-baseline metrics are in [Proof](#proof) above.

The measurement adds what a single number cannot carry: the recorded
baseline's top five survives a 20% bump to any single dimension weight. The
disagreements are as useful as the hits: the report names the junior seat the
level ladder over-rewards and the management role the composite still
surfaces. The dataset, the metric definitions, and the findings:
[`specs/quality.md`](./specs/quality.md).

The metrics are a golden fixture. A rubric change that moves them fails CI
until `eval/expected-metrics.json` is updated deliberately, and
`npm --prefix fish-career run record:eval` re-records the baseline from a
live judge run.

`arrivals` is the same discipline on the real cache: `quality` measures the
rubric, `arrivals` measures the pipeline against you.

`recall` covers what arrivals cannot see: the postings fish never wrote. Give
it the URLs of postings you found elsewhere, and it reports how far each got
in fish:

- written and scored;
- dropped as too thin or too old;
- listed but not remote, or not fetched yet;
- no longer listed;
- on a board you don't watch;
- on a system or site fish can't read.

It's a case log of the URLs you bring, not a recall rate.

## Privacy and data flow

fish.career runs on your machine as a stdio MCP server, holds no account, and
sends nothing anywhere except the calls below. Everything it reads and writes
hangs off `FISH_HOME` (default `~/.config/fish`); the npm package holds none
of it. The public repository ships fixtures only: point `FISH_HOME` at a
private checkout to keep personal state out of any public tree.

| Path | Contents |
|---|---|
| `profile.md` | Your candidate profile, sent verbatim to the judge when scoring |
| `watchlist.json` | Companies you watch, with provider and board slug |
| `preferences.json` | Pairwise preferences the ranking must satisfy, each with its source line |
| `.env` | `TYPESAFE_API_KEY` and the optional trace settings, read at startup |
| `postings/` | Cached posting text from public ATS APIs |
| `state/seen.json` | Every remote posting observed, with `observedAt`, its first-observation time, so polls deliver arrivals only |
| `state/scored.json` | Ledger of scores with profile hash and rubric version |
| `state/traces.jsonl` | One record per judge call: latency, tokens, raw answers |
| `state/verdicts.json` | Your grades on cached arrivals, with the profile hash and rubric version current when you made each call |
| `state/calibrations/` | Human rankings and their agreement with the judge |

### What leaves the machine

1. **ATS board reads.** GET requests to the four public, no-auth ATS APIs
   (Greenhouse, Ashby, SmartRecruiters, Lever) for the boards you watch. The
   board slug is the only identifier sent; no profile, no key, no account.
2. **Judge calls.** One POST per scored posting to `api.typesafe.ai`,
   carrying your profile text, the posting text, and the typed rubric
   questions, with your API key in the `Authorization` header. This is the
   only place your judgment data leaves the machine.
3. **Optional trace mirror.** With `FISH_TRACE=langsmith` and
   `LANGSMITH_API_KEY` set, each judge call is also POSTed to
   `api.smith.langchain.com/runs`. The mirror carries posting IDs, posting
   and profile hashes, the model, attempts, token counts, the application
   version, and the typed answers, but never the posting text or the profile
   text. The local JSONL trace is always written and remains the source of
   truth; a failing mirror never fails a scoring run.

There is no telemetry, no analytics, no crash reporting, and no update check.
The server opens no listening socket; it speaks stdio to the host that
launched it.

**Threat model.** In scope, defended: secrets stay in `FISH_HOME/.env`; the
package publishes `dist/` and `eval/` only, and the pack verification fails if
personal state or `.env` appears in the tarball; posting text is untrusted
data that is never executed and cannot change the pipeline's behavior — it
reaches the judge, where typed answers, the separate blocker check, `?` for
low confidence, and the calibration loop are the structural defense against a
posting that tries to prompt-inject; posting IDs are the cache file stems the
fetch engine writes from company and posting keys, and a posting is read by
its cache ID, which is validated against the cache-ID alphabet before any
filesystem access so an ID cannot escape `postings/`; there is no inbound
surface. Out of scope, by design:
local process trust (anything that can launch the server or read `FISH_HOME`
can read your profile and postings and spend your API key, so protect the
directory with normal file permissions and do not expose its stdio to an
untrusted host); encryption at rest (state is plain files; use full-disk
encryption if that matters); multi-user isolation and hosted operation (the
private product's concerns, gated by
[`docs/adr/0001-product-boundary.md`](./docs/adr/0001-product-boundary.md));
and the judge provider's handling of your data (your profile and posting text
go to TypeSafe under their terms, so do not put secrets in the profile).

**Forgetting.** Delete the corresponding files: `state/traces.jsonl` for call
history, `state/scored.json` for scores, `state/verdicts.json` for verdicts,
`state/calibrations/` for calibration history, `postings/` for the cache, and
the whole `FISH_HOME` to reset.

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
npm --prefix fish-career run health     # the gate CI runs
npm test --prefix fish-career           # vitest; deterministic, no network
```

A behavior change lands with a spec in [`specs/`](./specs); an architectural
decision lands as an ADR in [`docs/adr/`](./docs/adr). The gate, commit
conventions, and the state and secrets boundary: [`AGENTS.md`](./AGENTS.md).

## License

MIT. See [LICENSE](./LICENSE).
