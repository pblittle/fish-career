# 0006: run-scoped traces and pluggable sinks

Status: accepted · 2026-09-25

## Problem

Traces recorded what one judge call cost, but not which run it belonged to,
which posting text it judged, how many attempts the call took, or which
application version produced it. There was one destination (a local JSONL
file), so there was no way to send the same run to an observability platform
without losing the local replay, and `fish://runs/latest` could not say when
a run started or ended.

## Contract

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

### Readers

`TraceReader` exposes `recent(limit)`, `byRun(runId)`, and `latestRun()`, so
a resource can read a run without knowing the storage format.

### Sinks

- The JSONL sink is always written; it is the local source of truth and the
  replay format.
- `FISH_TRACE=langsmith` with `LANGSMITH_API_KEY` (and optional
  `LANGSMITH_PROJECT`, default `fish-career`) fans the same records out to
  LangSmith's `/runs` ingestion endpoint with the model, attempts, tokens,
  application version, and run ID as metadata.
- A telemetry sink never fails a scoring run: LangSmith write errors are
  reported through an `onError` callback and swallowed, while the JSONL
  write is allowed to fail loudly.

### Resources

`fish://runs/latest` returns the most recent run (`{ runId, records }`) and
`fish://runs/{runId}` returns one run by ID; an unknown run is a
protocol-level not-found.

## Non-goals

- No OpenTelemetry adapter yet; the port is the seam for it.
- No sampling or redaction of answers; a deployment that needs either should
  wrap the sink.
- No remote trace storage as the source of truth.

## Acceptance

- `score-postings` tests assert one run ID across a run's traces and the
  presence of `postingHash`, `attempts`, `version`, and the model.
- Reader tests cover `recent`, `byRun`, `latestRun`, malformed lines, and an
  empty file.
- Sink tests assert the LangSmith request shape and that a network failure
  or non-2xx is reported and swallowed.
- The protocol test reads `fish://runs/{runId}` from the run ID the triage
  returned and rejects an unknown run.
