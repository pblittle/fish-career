# 0004: the typed MCP contract

Status: accepted · 2026-09-25

## Problem

The 0.4 MCP surface was a collection of text-returning functions. Safety was
argument-dependent (`watchlist_add` probed or wrote depending on `confirm`),
posting filenames were the public identifier, passive state (`profile`,
`watchlist`, a posting) was exposed as action-shaped tools, there were no
reusable prompts, and clients could not branch on failure: every expected
error arrived as prose. A client had to parse text to know what happened and
whether the call was safe to repeat.

## Contract

### Tools

Ten action tools, each with an input schema, an output schema, safety
annotations, and one success/error path:

| Tool | Purpose | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|---|
| `watchlist_probe` | Probe the four ATS boards for a slug | yes | no | yes | yes |
| `watchlist_add` | Write a verified company | no | no | yes | no |
| `watchlist_remove` | Remove a company | no | yes | yes | no |
| `fetch_postings` | Poll boards, write arrivals | no | no | yes | yes |
| `triage_postings` | Score and rank postings | no | no | no | yes |
| `evaluate_ranking` | Hold the ranking to stated preferences | no | no | no | yes |
| `calibration_start` | Draw a seeded blind slice | no | no | no | no |
| `calibration_submit` | Record the human order, measure | no | no | no | yes |
| `calibration_rescore` | Re-measure under the current rubric | no | no | no | yes |
| `profile_update` | Replace the profile | no | yes | yes | no |

### Results

- `structuredContent` validated against the declared `outputSchema` on
  success. The SDK skips that validation when `isError` is set, so the error
  envelope is shaped by the same schema but enforced by this code and its
  tests rather than by the protocol layer.
- A concise text rendering alongside it for conversational hosts.
- Expected failures: `isError: true`, with
  `structuredContent.error = { code, message, hint? }` and the stable codes
  enumerated in `docs/mcp-migration.md`.

### Resources

`fish://profile/current`, `fish://watchlist`, `fish://postings`,
`fish://postings/{postingId}` (template), `fish://rubric/current`,
`fish://calibrations/latest`, `fish://runs/latest`.

`runs/latest` returns the most recent judge-call traces; run IDs arrive with
the evaluation metadata work.

### Prompts

`career-search-onboarding`, `review-new-arrivals`, `explain-ranking`,
`calibrate-rubric`, `audit-profile`. Arguments carry mutable intent; the
prompts prescribe no seniority, geography, or compensation floor. They
replace the checked-in starter prompt.

### Composition

`createServer(application, { version })` registers tools, resources, and
prompts and connects to nothing; `startStdioServer` does the transport.
Registration has no import-time side effects, so tests connect a real client
over the SDK's in-memory transport.

## Migration

Renames, splits, and the filename-to-ID change are documented in
`docs/mcp-migration.md`. `.txt` suffixes on posting IDs are accepted and
stripped.

## Non-goals

- No subscriptions, elicitation, or task-augmented calls.
- No run IDs yet; `fish://runs/latest` is the interim shape.
- No MCP App UI.

## Acceptance

- `src/interfaces/mcp/server.test.ts` connects an in-memory client and pins:
  the tool list (names, schemas, annotations), the resource list and
  templates, the prompt list, one structured success per tool family, an
  error envelope with a stable code, a resource read by URI, a
  protocol-level not-found, `.txt` normalization, and a rendered prompt
  argument.
- `npm --prefix fish-career run smoke` spawns the built server over real
  stdio and asserts the tool, resource, and prompt lists, one write, and one
  read.
- CI runs the official Inspector CLI against the built server for discovery
  (`tools/list`) and invocation (`tools/call`).
- `npm --prefix fish-career test` green with no network.

## Known portability note

Inspector's strict schema check warns that nullable fields (`rho`,
`previousRho`) serialize as `type: ["number","null"]`, which single-type
dialects can reject. The null branch is a real state (fewer than two scored
postings), and zod v4 does not emit `anyOf` for it, so the warning is
accepted; the fields are documented here rather than weakened.
