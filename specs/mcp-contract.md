# The typed MCP contract

Status: accepted

## Problem

A model is the client. To compose calls it needs to know what a call will do
before it runs it, and to branch on how a call failed without parsing prose.
A tool whose safety depends on an argument, a storage filename used as an
identifier, passive state behind an action-shaped tool, or an error that
arrives only as text each leave the client guessing.

## Contract

### Tools

Every tool has an input schema, an output schema, safety annotations, and one
success path and one error path. A tool that both probes and writes is two
tools. The tools, their annotations, inputs, outputs, and errors are listed
in [`docs/reference/mcp.md`](../docs/reference/mcp.md).

`watchlist_add` takes exactly one of two forms: a posting or board `url`,
read offline ([`specs/pipeline.md`](./pipeline.md), Posting URLs), or a
`provider` and `slug`. Both or neither, or a URL on another system or a job
search site, fails with `INVALID_COMPANY` and a message that says why. A
`name` or board already watched is a no-op that returns the existing entry.

`verdict_record` is destructive because latest-wins replaces the posting's
earlier verdict and keeps no history; it is idempotent because a repeated call
converges on one record per posting. The verdict's scale and store are in
[`specs/quality.md`](./quality.md).

### Results

- `structuredContent` validated against the declared `outputSchema` on
  success. The SDK skips that validation when `isError` is set, so the error
  envelope is shaped by the same schema but enforced by this code and its
  tests rather than by the protocol layer.
- A concise text rendering alongside it for conversational hosts.
- Expected failures: `isError: true`, with
  `structuredContent.error = { code, message, hint? }`, the code from
  `ErrorCode` in `src/domain/errors.ts` and the hint from `HINTS` in
  `src/interfaces/mcp/schemas.ts`.

### Stable identifiers and error codes

The codes are a contract: clients branch on them, a code is never
reused for a different failure, and the surface may add codes but not change
the meaning of existing ones. The message and hint are for humans and may
change. Posting IDs are stable cache filename stems; a `.txt` suffix on input
is accepted and stripped.

### Resources and prompts

Passive state is a resource, never a tool, and a missing posting or run is a
protocol-level not-found. Prompts carry the repeatable workflows; their
arguments carry mutable intent, and they prescribe no seniority, geography,
or compensation floor. Both are listed in
[`docs/reference/mcp.md`](../docs/reference/mcp.md).

### Composition

`createServer(application, { version })` registers tools, resources, and
prompts and connects to nothing; `startStdioServer` does the transport.
Registration has no import-time side effects, so tests connect a real client
over the SDK's in-memory transport.

## Non-goals

- No subscriptions, elicitation, or task-augmented calls.
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
