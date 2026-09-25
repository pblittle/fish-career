# 0005: ranking quality is measured

Status: accepted · 2026-09-25

## Problem

"The model scored some jobs" is not a claim about anything. The preference
eval (0001) is necessary but narrow: it only checks whether the ranking
satisfies constraints the profile already states. There was no labeled
dataset, no top-of-list metric, no way to compare a rubric or model change
against a stable baseline, and no sensitivity analysis to show whether a
result depends on the exact weights.

## Contract

### Dataset

- `fish-career/eval/` holds 17 synthetic postings graded 0-3 by the operator,
  each with a note saying why. The set deliberately includes the difficult
  cases: blockers (on-site, hybrid with relocation, out-of-geography remote),
  overqualification, a missing-compensation posting, an ambiguous location, a
  duplicate regional listing, an adversarial posting with embedded scoring
  instructions, and a posting too thin to score.
- The dataset uses the fixture profile in `eval/profile.md`, never a real
  operator's profile.

### Baseline

- `eval/base-run.json` is a recorded live judge run over the dataset: raw
  typed answers plus latency and token usage per posting, with model, rubric
  version, profile hash, and capture time.
- `npm run record:eval` re-records it. It is a development script that spends
  real credits and writes into the package tree; it is not part of the CLI or
  the published entry points.
- The thin posting is skipped by design and recorded in the baseline's
  `skipped` list, so "no answer" is a stated outcome rather than a silent
  absence.

### Metrics

Over the predicted order and the labels:

- pairwise accuracy (comparable pairs only; equal labels are skipped),
- Kendall tau-b,
- Spearman rho,
- precision@k (label >= 2 counts as relevant),
- nDCG@k over graded relevance,
- per-dimension weight sensitivity: bump one weight by delta, renormalize,
  re-rank, report top-k overlap and maximum rank shift.

Every metric returns null rather than a guess when its inputs are too thin.

### Surfaces

- `fish quality [--k N] [--json]` prints the report from the bundled dataset
  and baseline; deterministic, offline, no API key.
- `eval/expected-metrics.json` is the golden fixture. A rubric, dataset, or
  baseline change that moves the metrics must update it deliberately; the
  regression test fails otherwise.
- `docs/quality-report.md` is the human-readable report generated from the
  baseline.

## Non-goals

- No LLM-generated labels; labels are authored judgment.
- No online experimentation or production telemetry.
- No automatic rubric optimization; sensitivity points at fragile weights,
  and changing them remains a reviewed diff.

## Acceptance

- `npm --prefix fish-career test` green with no network, including the
  golden-metric comparison, the label/baseline accounting, the blocker
  ordering, the pair constraints, and the adversarial posting staying out of
  the top five.
- `fish quality` prints the report offline.
- The recorded baseline's top five are all labeled 2 or 3, and every blocked
  posting ranks below every clean one.
