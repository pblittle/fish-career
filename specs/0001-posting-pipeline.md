# 0001: the fish posting pipeline

Status: accepted · 2026-09-22

## Problem

Job postings originate on public, official, no-auth ATS feeds (Greenhouse,
Ashby, SmartRecruiters, Lever) that any client may poll. LinkedIn is a
middleman that hides compensation and can restrict the account; watching
the feeds directly yields a daily diff of exactly the companies worth
watching, with the comp data included.

The scarce resource is the operator's attention. The pipeline's job is to
convert an unbounded stream of postings into a small ranked table with the
reasons attached, and to prove measurably that the ranking tracks the
operator's own judgment rather than a model's taste.

## Contract

### fetch: watchlist to postings cache

- Four public ATS APIs, one flat posting shape: `TITLE`, `COMPANY`,
  `LOCATION`, `COMPENSATION`, `URL`, `PUBLISHED`, plus the full body.
- Remote postings only. Every observed remote posting is marked seen,
  written or not; later polls deliver arrivals only. A recency window
  applies on the first poll (or an explicit `--days`).
- A body too thin to score is resolved through the provider's detail
  endpoint, or baselined if it stays thin.

### triage: postings to ranked rows

- One judge call per posting: five Score dimensions plus one Noul
  hard-blocker. Weights, criteria, and blocker instructions are data in
  `jev.ts`, where they can be argued with.
- Judge calls retry with backoff on 429, 5xx, and dropped connections; a
  4xx throws at once. Every call writes a trace: latency, token usage, raw
  answers, profile hash, rubric version.
- Every scored row checkpoints to the ledger immediately; a crash loses at
  most the row in flight.
- Ranking: a blocker at 0.5 or above demotes a row below every clean row,
  regardless of composite. Regional variants of one vacancy collapse to
  one row that names the other offices.
- The ledger records score plus provenance (profile hash, rubric version).
  A profile or rubric change re-scores stale entries on the next run; the
  operator never babysits invalidation.

### evaluate and calibrate: the measurements

- `evaluate`: pairwise preferences in `preferences.json`, each quoting the
  profile line it came from. The ranking must satisfy all of them.
- A golden fixture of recorded judge answers runs the same eval in CI with
  no network and no key.
- `calibrate`: optional and stronger. Spearman agreement against a
  hand-ranked slice, for when an operator will rank one.

### surfaces

One engine, two surfaces: the CLIs (`fetch.mjs`, `triage.mjs`) and the MCP
server (`fish-career`) over the same modules, so semantics cannot drift.

## Non-goals

- No scraping LinkedIn, no auto-applying, no multi-candidate profiles.
- No MCP App UI yet; the ranked table is text until the App plane exists.
- No LLM-authored prose in the ranking path. Typed answers only.

## Acceptance

- `npm --prefix fish-career test` green, including the golden eval slice.
- `node triage.mjs --evaluate` reports every revealed preference satisfied.
- Every scored row is reproducible from `state/traces.jsonl`.
