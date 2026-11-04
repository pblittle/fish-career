# How to add an MCP tool

Add a tool to the stdio server that a model can call safely: one use case
underneath, typed input and output, honest annotations, and stable error
codes.

## Prerequisites

- A checkout with dependencies (`npm ci --prefix fish-career`).
- [`AGENTS.md`](../../AGENTS.md), which holds the boundaries and the gate,
  and [`specs/mcp-contract.md`](../../specs/mcp-contract.md), which holds the
  surface's rules.

## Steps

1. **Write the use case first.** Put the decision in `src/domain` and the
   orchestration in `src/application`, reaching the outside world only
   through the ports in `src/ports`. Add it to `CareerApplication` in
   `src/application/career-application.ts`, and test it over the in-memory
   adapters in `src/adapters/fake/`. The tool and any CLI command will both
   call this one method.

2. **Name each expected failure.** Throw `ApplicationError` with a code from
   `ErrorCode` in `src/domain/errors.ts`. A new failure gets a new code; a
   code is never reused for a different failure. Add its recovery hint to
   `HINTS` in `src/interfaces/mcp/schemas.ts`.

3. **Declare the output.** Add an output schema to `schemas.ts` as a union
   of the success shape and `errorEnvelope`, as every other tool does.

4. **Register the tool** in `src/interfaces/mcp/tools.ts`:
   - a `title`, and a `description` written for the model that will read it:
     what it does, what it writes, and what to call before or after it;
   - an `inputSchema` with a `.describe()` on every field;
   - annotations that tell the truth about this call: `readOnlyHint`,
     `destructiveHint`, `idempotentHint`, `openWorldHint`. A call that both
     reads and writes is two tools, not one with a flag;
   - a handler that makes one application call, renders text, and returns
     `ok(text, structured)`, or `failure(err)` from its `catch`.

5. **Update what pins the surface.**
   - `src/interfaces/mcp/server.test.ts`: the sorted tool list, and an
     assertion for the new tool's annotations and one success and one error
     result.
   - `scripts/smoke-stdio.mjs`: its expected tool names.
   - [`docs/reference/mcp.md`](../reference/mcp.md): the tool table, a
     section with its inputs, outputs, and errors, and each new code in the
     error table.
   - `specs/mcp-contract.md`, only if a rule of the surface changes.

6. **Add the CLI command** in `src/interfaces/cli/cli.ts` if the operator
   should have it at a terminal too, and its line in `USAGE` and in the
   [CLI reference](../reference/cli.md).

## Verification

```bash
npm --prefix fish-career run health
npm --prefix fish-career run smoke
```

The gate passes, and the smoke line counts one more tool.

## Troubleshooting

- **`check:boundaries` fails.** The new code imports a filesystem or network
  module, or calls `fetch`, outside `src/adapters` (or outside the CLI's
  allowance for user-named files). Move that work behind a port.
- **The tool returns `isError` with no `error.code`.** The SDK rejected the
  arguments against the input schema before your handler ran; the text says
  which field.
- **A success result fails validation.** The handler's structured value does
  not match the output schema; the SDK validates success results against it.
