---
name: architecture-guardrails
description: Hard architecture rules for fish.career: dependency direction, one core and many surfaces, stable posting IDs, runtime validation at every boundary, stable error codes, determinism, the MCP contract, and what not to add. Load before changing code in src/, the MCP surface, or an adapter.
---

# Architecture guardrails

These are the boundaries that make fish.career a decision system rather than a
script. They are not preferences. When a change needs to cross one, stop and
write the reason down as a spec or an ADR, not a comment.

## Dependency direction

```text
domain under application under interfaces
adapters implement ports and depend inward
bootstrap wires
```

Read it as: inner layers know nothing about outer ones.

- `src/domain` is pure policy: posting, rubric, answers, ranking, preferences,
  calibration, ledger, admission, random, errors. No I/O, no clock, no
  randomness beyond the seeded source, no imports from outside domain.
- `src/ports` are interfaces the inner layers own: ats-provider, judge,
  posting-repository, ledger, trace-sink, stores, clock. A port is added by
  the layer that needs it, never by an adapter that wants to exist.
- `src/application` is use cases over a dependencies object. It orchestrates
  domain policy through ports.
- `src/adapters` implement ports: ats, judge (jev, fake), filesystem, fake
  (in-memory), trace (JSONL, LangSmith). Adapters depend inward; nothing inner
  depends on an adapter.
- `src/interfaces` render. `src/bootstrap` wires.

The acceptance rule from spec 0003, which is testable and must stay true: **no
file under `src/interfaces` or `src/application` imports `node:fs` or calls
`fetch`.** That is what lets the whole workflow run over in-memory adapters
with no filesystem, clock, or network.

## One core, many surfaces

A capability lands as an application use case first. The MCP handler and the
CLI command call it and render the result; neither reads a directory, builds a
judge prompt, decides an order, or invents an error code.

If a surface needs behavior the core does not expose, the core is missing a
use case. Do not add the shortcut to the surface. Two surfaces that can
disagree about a decision is the bug this architecture exists to prevent.

## Stable posting IDs

A posting's ID is its cache filename stem today; storage layout is an adapter
detail. Every ledger entry, trace, calibration, preference, tool, and command
speaks IDs. Never accept a filename or path as a domain identifier, and never
resolve one by splitting on slashes in a surface. If the filesystem layout
changes, nothing outside the adapter should notice.

## Validate every external boundary at runtime

Types do not exist at runtime. Validate:

- **Judge responses**, the hard blocker and every dimension, finite scores,
  confidence in 0..1, via a schema at the adapter boundary. Reject malformed
  answers; never coerce them.
- **Watchlist entries and preferences.** Invalid entries are dropped, not
  trusted.
- **The ledger.** Corruption is reported, never silently reset.
- **Environment and files.** Missing profile, missing key, unreadable
  preferences are expected failures with names, not surprises.

## Errors have stable codes

Use cases throw `ApplicationError` with a code from the closed set in
`src/domain/errors.ts` (`NO_JUDGE`, `NO_PROFILE`, `EMPTY_WATCHLIST`,
`NOTHING_TO_SCORE`, `NO_PREFERENCES`, `POSTING_NOT_FOUND`, `INVALID_RANKING`,
`NO_PENDING_CALIBRATION`, `NO_CALIBRATION_HISTORY`, `LEDGER_UNREADABLE`,
`INVALID_COMPANY`, `UNKNOWN`). Surfaces render the message and map the code to
the protocol (`isError: true` plus a recovery hint over MCP); they do not
invent codes. An expected domain failure is a result with a name, not an
exception to swallow.

## Determinism and provenance

- Randomness in the pipeline is seeded (`src/domain/random.ts`). No
  `Math.random` in a draw, a sample, or an order.
- A score records the profile hash and rubric version that produced it; a
  calibration records its seed; a trace records latency, tokens, model, and
  raw answers; run-scoped traces carry a run ID.
- Same postings + same profile + same rubric version gives the same ranking.
  A ranking you cannot replay is not a measurement.

## The MCP surface is an API for models

- Every tool declares an input schema and an output schema, and returns
  `structuredContent` beside a human text rendering. The structured form is
  for composition; the text form is for chat.
- Every tool is annotated honestly: `readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`. A tool whose safety depends on an
  argument is two tools (probe versus mutate), not one.
- Expected domain failures return `isError: true` with a stable code and a
  recovery hint. Unexpected failures are logged and become protocol errors.
- Passive context belongs in resources; repeatable workflows belong in
  prompts. Do not add an action-shaped tool for something a resource can read.

## Ranking quality is a gate

- `fish quality` grades the pipeline against the labeled dataset in
  `fish-career/eval/`. The expected metrics are a golden fixture: a change
  that moves them fails CI until `eval/expected-metrics.json` is re-recorded
  on purpose.
- `calibrate` measures agreement with one blind human order. Neither number is
  decoration; a change that weakens either is a product change, and says so in
  the PR.

## What not to do

- No orchestration framework (LangGraph or otherwise) in `domain` or
  `application`. The deterministic core stays portable. An orchestration graph
  is an adapter over the application services, and only when durable,
  interruptible state earns it.
- No package or repository split until a second real consumer exists. A
  modular monolith with clean ports is the platformization signal; directory
  proliferation is not.
- No abstraction with one caller and no second on the horizon. Ports are
  justified by a replaceable dependency, not by symmetry.
