# 0007: finding quality is graded by the operator

Status: accepted · 2026-09-27

## Problem

The ranking's quality is measured against a synthetic dataset (0005) and a
blind calibration slice, but nothing closes the loop on the real cache: the
arrivals fetch actually wrote, and whether the operator would act on them.
`fish fetch` also reported only what it wrote, not what it dropped, so "the
pipeline is quiet" could not be told from "the boards are quiet" or "the
admission rules ate everything"; the collapsed `baseline` bucket hid the
reason. The seen index had no first-observation time, so a future
freshness-lag report had no field to read. And there was no place to record
the operator's own verdict on an arrival, which is the ground truth the
whole loop exists to track.

## Contract

### Grades

- The scale is the eval dataset's, verbatim (`fish-career/eval/labels.json`):
  3 act on it now; 2 worth a look; 1 a miss, kept so the ranking can be
  measured against it; 0 should not surface. A blocker stays a separate
  demotion in triage; there is no "0 = blocked".
- A verdict is the human's ground truth at a time:
  `{ postingId, label, profileHash, rubric, at }`. Latest-wins: one verdict
  per posting, a re-grade replaces it, and no history is kept.
- Provenance is recorded for reproducibility and never invalidates a verdict.
  A profile or rubric change does not make a human judgment stale, the way it
  makes a judge score stale.
- The store is `state/verdicts.json` under `FISH_HOME`: tolerant parse,
  `ok:false` on corruption, atomic write. A corrupt store is never
  overwritten. Recording refuses with `VERDICTS_UNREADABLE`, because a
  verdict cannot be recomputed by paying for another judge run.

### The metric

- `precision@arrival` = graded arrivals with label >= 2 / graded arrivals.
  The denominator is graded arrivals, never the whole cache: an ungraded
  arrival is unknown, not a miss.
- `coverage` = graded / cached. Null when the cache is empty.
- Every number is null rather than a guess when its inputs are too thin. A
  code constant, `PRECISION_FLOOR = 45` (an ESTIMATE from the advice run),
  suppresses the precision line below it as "no read (n=... below the
  floor)". Above it, a Wilson 95% interval accompanies the rate.
- Verdicts never feed `eval/expected-metrics.json` or `fish quality`; spec
  0005's golden metrics stay separate.

### Surfaces

- MCP: exactly one new tool, `verdict_record`, input `{ postingId, label
  0-3 }`, an output schema, and annotations readOnly false, destructive
  true (a re-grade replaces the prior verdict and no history is kept),
  idempotent true (one record per posting; the same call converges),
  openWorld false. An unknown posting is `POSTING_NOT_FOUND`.
- CLI: `fish arrivals` lists the ungraded with stable IDs;
  `fish arrivals grade <postingId> <0|1|2|3>` records a verdict;
  `fish arrivals summary` prints coverage and precision@arrival.
- `fish fetch` reports drops by reason: not remote (counted before
  admission), too thin to score, out of window. The out-of-window bucket is
  degenerate after the first poll: the default window is first-run only, so
  it fires on the first run or when `--days` is passed explicitly.
- The seen index records `observedAt`, the first-observation time, set when
  a posting is first marked seen and preserved thereafter. Freshness-lag
  reporting is not in this slice; the field is the prerequisite.

## Non-goals

The A2UI card, LangGraph, the scheduler, the known-item probe, the directory
frame, freshness-lag reporting, verdict history, and any automatic tuning.

## Acceptance

- `npm --prefix fish-career test` green with no network and no API key,
  covering: grade validation, latest-wins, tolerant and corrupt store reads,
  per-reason drop counts, `observedAt` set once and preserved, the precision
  denominator, floor behavior, Wilson bounds, coverage, and the MCP tool's
  success, re-grade, and `POSTING_NOT_FOUND` paths.
- `fish arrivals`, `fish arrivals grade`, and `fish arrivals summary` render
  the lines above; `fish fetch` prints the drop counts.
- `npm --prefix fish-career run health` green.
