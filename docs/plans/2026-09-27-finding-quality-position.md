# 2026-09-27 — finding quality: the team's position

Status: intent. This file briefs an advice run. It states what is being asked,
not what is built. Nothing here claims built behavior.

## Goal

The founder asks the team's position on making the *finding* step measurably
better: "what are your thoughts on this?" Deliver a position per layer, with
evidence — not a survey, not an implementation. The founder decides what gets
built next.

Founder's rulings, in their words:

- "the first step is measurably find relevant job postings. more or less what
  i have" — the finder is the product's core; the next step is measuring it,
  before any outreach or outcome loop.
- The overall solution must leverage Fish, may take a different form, and use
  modern technology: Fish, LangGraph, MCP (servers/apps), A2UI.

## The proposal under evaluation

The session's proposal for "measurably find relevant postings," summarized:

Instruments:

1. A live verdict stream on real arrivals, graded 0–3 (blocked/miss/maybe/
   act), recorded locally (e.g. `FISH_HOME/state/verdicts.json`), yielding
   precision@arrival. Delivered as an A2UI arrival card; each button a
   `verdict.record` MCP tool call.
2. A recall probe, because the cache cannot show what was never fetched:
   (a) a known-item test — postings found elsewhere that the operator would
   want, checked against the seen index and cache for found/rank; (b) a frame
   sample — companies drawn from a public directory, probed across providers,
   measuring coverage share and missed volume as an estimate.
3. Filter-drop accounting: count drops per reason (recency window, non-remote,
   thin text) and sample each bucket for a verdict, so the admission policy's
   cost is measured rather than assumed.

Mechanisms, each tied to a metric: provider expansion (coverage share); a
scout graph (LangGraph): profile → candidate companies → probe boards → human
confirm/deny → watchlist (proposal precision, yield per board); scheduled
polls and push of new top arrivals (freshness lag, postedAt → surfaced);
high-scoring postings proposing their company's board (yield per auto-added
board).

Surfaces: MCP tools `verdict.record`, `recall.probe`, `coverage.report`; A2UI
arrival card and coverage board; LangGraph as a durable human-in-the-loop
runner in the adapters layer.

Smallest first slice proposed: the verdict loop, then `fish recall`.

## Rules that do not move

- `AGENTS.md`: dependency direction (domain under application under
  interfaces; adapters depend inward; bootstrap wires); no `node:fs` or
  `fetch` under `src/interfaces` or `src/application`; the only outbound
  calls are GETs to public ATS APIs, one POST per scored posting to the
  judge, and the optional LangSmith mirror; personal state in `FISH_HOME`,
  never the repo; evidence labeled OBSERVED, CODE-READ, or ESTIMATE.
- `product-spine`: FACTS ONLY; the judge is untrusted; judgment is data.
- Spec 0005 non-goals: no LLM-generated labels; no online experimentation;
  no automatic rubric optimization. The golden eval metrics are not to be
  conflated with live verdicts.

## Member assignments

Read this file first. Read-only: no writes, no network calls, no repo
changes. Answer with a position and its evidence.

### evaluation-scientist — the measurement construct

Owns: `src/domain/metrics.ts`, `src/domain/quality.ts`, `src/domain/
calibration.ts`, `fish-career/eval/`.

Rule on: Is precision@arrival + known-item recall + frame sample the right
construct for "measurably find relevant postings"? Specifically: (a) how many
arrivals per week make precision@arrival more than a coin flip — what power,
and how should uncertainty be reported given the repo's "null rather than a
guess" ethos; (b) what selection bias the watchlist-derived arrival stream
introduces and whether per-board stratum fixes it; (c) is the known-item test
computable from the seen index and cache — what identifier does a pasted URL
map to, and what breaks when the same job is seen on two boards; (d) what
validity a directory frame sample has when the frame itself is chosen by the
operator, and whether the outbound-calls policy permits fetching it at all
(directory pages are not ATS APIs); (e) how live verdicts stay separate from
the spec 0005 golden labels, and what provenance verdicts need (the ledger's
staleness rule is the precedent: `src/domain/ledger.ts`).

### provider-engineer — the finder mechanics

Owns: `src/adapters/ats/`, `src/domain/posting.ts`.

Rule on: Can drops be counted by reason today? In `fetch-postings.ts` the
remote filter runs before admission, and `admitPostings` collapses the
recency window and post-detail thin text into one `baseline` decision — name
the smallest change that gives an honest per-reason count. Which additional
ATS providers are plain public GET JSON boards (state which you verified from
code, which from documented knowledge, which are ESTIMATEs; Workday is
understood to be a POST and therefore an ADR-level decision). What postedAt
fidelity do the four providers actually give, and can freshness lag be
computed honestly? Where could candidate companies come from without
violating the outbound-calls policy (directories are not ATS APIs)? Is a
scheduler or graph needed for the first slice at all, or does a command plus
state suffice?

### mcp-architect — the surfaces and protocol

Owns: `src/interfaces/mcp/`, `src/ports/`, `src/bootstrap/create-server.ts`.

Rule on: Do `verdict.record`, `recall.probe`, `coverage.report` fit the
existing MCP contract (spec 0004) — naming, output schemas, annotations, error
semantics — and which of these should not be tools at all? Is A2UI-over-MCP
(resource with `application/a2ui+json`, `_meta.ui` template, `updateDataModel`
from a tool call, actions as tool calls) achievable on the current server
without new protocol surface, and what is the minimal first card? Where do
verdicts live as a port, and does the ledger's provenance pattern carry over?
Where does LangGraph live so `check:boundaries` stays green, and is it
load-bearing for the first slice or decorative until the scout exists?

## Work order

1. Each member reads this file and answers in this shape, 400 words max:
   Position / What's right / What's wrong or missing / Explicit reject list /
   Evidence (file:line or command+output, labeled OBSERVED, CODE-READ, or
   ESTIMATE) / Owed proof.
2. Coordinator verifies every claim against the code, then synthesizes with
   disagreements kept.
3. The founder decides what gets built; a spec follows only on their word.

## Outcome (advice run, 2026-09-27)

Coordinator-verified. Where a member claim is restated here, it was read back
against the code and held, except where noted.

Converged:

- Slice one is measurement plumbing, not machinery: no LangGraph, no
  scheduler. LangGraph stays in `examples/langgraph` (which already imports
  the engine one way; `check-boundaries` is what keeps it that way) and earns
  its place at the scout.
- Verdicts are the primary instrument, but precision@arrival must report
  coverage and a floor (~45 graded arrivals for a claim at >70%; 30 is
  underpowered — binomial arithmetic, ESTIMATE) and a Wilson interval. A
  naive copy of `precisionAtK` (`src/domain/metrics.ts:69-75`) counts an
  unanswered arrival as a miss.
- Reuse the eval's grades (`eval/labels.json:2-8`): 3 act, 2 look, 1 miss,
  0 should not surface; blockers stay a separate demotion. No "0 = blocked".
- The verdict store mirrors the filesystem ledger (tolerant parse, atomic
  write) but inverts its staleness rule: a verdict is the human's ground
  truth at a time. Provenance (profile, rubric, posting) is recorded for
  reproducibility, never used to invalidate.
- MCP: slice one adds one tool, `verdict_record` (snake_case, per spec 0004);
  coverage is a passive resource; `recall_probe` is not a tool yet. A new
  tool amends spec 0004's ten-tool table and its pinned tests — budget it.
- Drop accounting: split the collapsed `baseline` (`src/domain/admission.ts:
  36-48`) into out-of-window and thin-text counts. Non-remote drops happen
  pre-admission (`src/application/fetch-postings.ts:73`) and can be counted,
  not verdict-sampled. Thin-text verdicts are meaningless below
  `MIN_SCORABLE_TEXT`. The recency bucket is degenerate after the first run
  (`fetch-postings.ts:52-53`).
- Recall: the known-item probe is a case log, not a rate — the seen index
  stores no URL (`src/ports/stores.ts:40-45`) and keys are provider-scoped
  (`src/adapters/ats/providers.ts:80,104,141,174`), so URL-to-ID is unsolved.
  Directory frame sampling is outside the outbound-calls policy and is
  rejected this slice.
- Freshness lag is not computable today: no first-seen timestamp on
  `SeenEntry`, no time on `Arrival` (`fetch-postings.ts:7-13`); Greenhouse's
  `date` is `updated_at` (`providers.ts:111`), an upper bound, not a postedAt.

Contradiction found (strongest finding shape, coordinator-verified): spec
0003:100-101 and AGENTS.md ban `node:fs` under `src/interfaces` and
`src/application`, but `src/interfaces/cli/quality.ts:7`, `cli/demo.ts:10`,
and a dynamic import at `cli/cli.ts:274` violate it. `check-boundaries` does
not enforce the ban. The fetch half holds: only `providers.ts:11` calls
fetch. Resolve deliberately — route fixture reads through a port, or amend
the rule.

Open, founder's call:

- Approve slice one: `verdict_record` + verdict store + per-reason drop
  counts + a first-seen timestamp; no graph, no scheduler.
- Resolve the spec 0003 contradiction one way or the other.
- Directory frame: an ADR, or drop it.

Owed proof on the founder's machine: arrivals/week from live polls; one real
poll's per-reason drop counts; a host that renders `application/a2ui+json`.
