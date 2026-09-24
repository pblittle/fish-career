# fish.career

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

2. Build the engine. Both root scripts import from `fish-career/dist/`,
   which is gitignored, so a fresh clone has nothing to run until this
   step:

   ```bash
   npm --prefix fish-career ci
   npm --prefix fish-career run build
   ```

3. Fill `profile.md`. It is sent verbatim to the TypeSafe API as the
   state for every scoring call, so it carries no contact details, only
   role-relevant facts. The profile's accuracy bounds everything
   downstream; keep it current (floor, target scope, hard constraints).

4. Run `node fetch.mjs`. First run writes only postings newer than 14
   days; the window widens with `--days N` or disappears with `--all`.

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
