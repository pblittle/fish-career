# fish.career

> Me and Eric B. and a nice big plate of fish, which is my favorite
> dish, but without no money it's still a wish.
>
> Eric B. & Rakim, "Paid in Full"

Get paid in full.

A job-posting pipeline for one senior operator: watch the companies
worth watching, pull their remote postings from public ATS feeds, and
rank the arrivals against a profile grounded in real work.

Built for Barrett Little's 2026 search. Senior technical leadership
without direct reports: platform architecture and Thoughtworks-style
proof-of-concept work, remote US, 200k floor. See `profile.md`.

MIT licensed. `resume-clean.md`, `.env`, `postings/`, and `state/` stay
local; they are gitignored.

## Why this exists

LinkedIn is a middleman. Job postings originate on public, official,
no-auth ATS feeds (Greenhouse, Ashby, SmartRecruiters, Lever) that any
client may poll. Watching those feeds directly yields a daily diff of
exactly the companies you choose, with compensation data LinkedIn hides,
and no LinkedIn account in the loop to be restricted.

The scarce resource is the operator's attention. The pipeline's job is to turn
an unbounded stream of postings into a small ranked table with the reasons
attached, and to prove measurably that the ranking tracks the operator's own
judgment rather than a model's taste. Everything below exists to serve that.

## How it works

One engine, two surfaces. `fish-career` is the engine: fetch, judge, and
measure. The two CLI scripts and the MCP server are thin skins over the same
modules, so a score means the same thing however you asked for it. State lives
outside the package (`FISH_HOME`), so the install stays stateless.

The ranking is Jev (TypeSafe's System One model): typed questions, not
generated prose. Each posting is judged on five dimensions as separate
Score questions in one request, plus a Noul hard-blocker check, with
weights and rubrics in `DIMENSIONS`, where they can be argued with. Every
score records the profile hash and rubric version that produced it, so a
change to either re-scores on the next run.

Calibration against the operator's own judgment comes first. See
Calibration, and `ARCHITECTURE.md` for the decisions behind this shape.

## Commands

Requires Node 20.12+. No runtime dependencies.

`FISH_HOME` overrides where profile, watchlist, postings, and state live.
Unset, the CLIs use this folder and the MCP server uses `~/.config/fish`.
Set it to the same path on both if you want them to share a ledger.

```bash
node fetch.mjs                      # poll the watchlist, write new remote postings
node fetch.mjs --company ramp       # one company (substring match)
node fetch.mjs --all                # replay the whole backlog
node triage.mjs                     # score new postings with Jev, print ranked table
node triage.mjs --sample 12         # score a random slice (calibration)
node triage.mjs --reuse             # rescore the SAME slice (weight tuning)
node triage.mjs --rescore           # score everything again, ignore scored state
node triage.mjs --evaluate          # hold the rubric to preferences.json
node triage.mjs --explain <needle>  # full probabilities for one posting
node probe-boards.mjs               # verify watchlist boards and live counts
```

Daily loop:

```bash
node fetch.mjs && node triage.mjs
```

Optional cron (fetch only; scoring is interactive):

```
0 8 * * * cd ~/sandbox/fish && node fetch.mjs >> fetch.log 2>&1
```

## Setup

1. TypeSafe API key from https://console.typesafe.ai/keys into `.env`
   (copy from `.env.example`):

   ```
   TYPESAFE_API_KEY=...
   ```

2. Fill `profile.md`. It is sent verbatim to the TypeSafe API as the
   state for every scoring call, so it carries no contact details, only
   role-relevant facts. The profile's accuracy bounds everything
   downstream; keep it current (floor, target scope, hard constraints).

3. Run `node fetch.mjs`. First run writes only postings newer than 14
   days; the window widens with `--days N` or disappears with `--all`.

## Files

| Path | Purpose |
|---|---|
| `watchlist.json` | Companies and their ATS board tokens. 32 entries, all verified live. |
| `profile.md` | Candidate profile; the judgment target. Currently resume-grounded. |
| `preferences.json` | Pairwise preferences the ranking must respect, each quoting its profile source. The eval. |
| `postings/` | One file per posting, with a header (title, company, location, comp, URL, date) and full text. |
| `state/seen.json` | Fetch dedupe. Every remote posting observed in a poll is marked seen, so later runs deliver arrivals only. |
| `state/scored.json` | Triage ledger. Each score records the profile hash and rubric version that produced it; a change to either re-scores on the next run. Calibration runs never mark. |
| `state/traces.jsonl` | One record per judge call: latency, token usage, raw answers, error if any. |
| `state/last-sample.json` | The saved calibration slice, for `--reuse`. |
| `.firecrawl/` | Parsed documents (gitignored). `resume-clean.md` at the root is the entity-decoded resume. |

Adding a company: add a line to `CANDIDATES` in `probe-boards.mjs`,
run it, confirm identity by reading a title or two (slugs collide:
`scaleai` and `gamma` both needed a check), then move the verified entry
into `watchlist.json`.

## Calibration and eval

The ranking is only as good as the rubric, and the rubric is only as good
as its agreement with the operator. Two measurements, in increasing
strength:

1. **`node triage.mjs --evaluate`**: the eval. Scores the postings
   `preferences.json` names and checks the ranking against pairwise
   preferences the profile already states, each carrying its source line.
   No human step; run it after any profile or weight change. The same
   check runs in the test suite against recorded Jev answers
   (`fish-career/src/fixtures/eval-slice.json`), so CI fails if a change
   breaks the operator's stated judgment.
2. **Calibration**, the stronger measurement, optional:
   `node triage.mjs --sample 12` on a stratified slice (one per company,
   obvious fits and deliberate misses both), rank the same 12 by hand
   BEFORE reading Jev's table, compare. Where they disagree, decide
   whether the model or the rubric is wrong, adjust weights or level
   descriptions in `DIMENSIONS`, and `--reuse` on the same slice until it
   agrees.

A dimension that keeps answering at low confidence is usually a profile
gap, not a model failure: sharpen `profile.md`, not the code.

## Known limits

- Greenhouse boards carry no compensation data, so the comp dimension
  reads neutral there; sub-floor postings on Greenhouse slip past the
  comp gate and should be eyeballed at the top of the table.
- US eligibility is not filtered at fetch; it lives in posting text and
  is judged by the location dimension and the blocker check.
- Ashby comp ranges arrive as written by the employer (e.g. `$158.4K –
  $237.5K`), unverified.
- Jev's calibration on job postings is unknown until the first
  calibration run; treat early rankings as a measurement, not a verdict.

## Possible futures

Open core, on purpose. This repository stays MIT and the engine stays
free, since it is shared infrastructure with near-zero marginal cost.
If it proves itself, the product is the platform that runs on top of it:
an App-plane ranked table (the pattern is proven elsewhere in this
operator's work), Stripe credit packs, and per-run pricing that follows
the actual cost. The framework-then-platform shape, on purpose.

## Naming

Named for *Paid in Full*. `fish.career` names this module and is the
intended domain of the hosted product; the domain is deliberately
unregistered while the product is hypothetical. The package is
`fish-career`, so the npm surface and the filesystem agree.

This is one module, not the whole platform. `fish.agency` is reserved
for the larger thing if it is ever built.
