# 2026-09-27 — the verdict loop and the boundary rule (build run)

Status: intent until merged. This is the brief for two build workstreams. It
states what gets built, not what is built.

## Goal

Implement the two decisions the founder approved. In their words, the reply
was "ok" to the coordinator's resume message, which asked for exactly:

1. Slice one of finding quality, as sketched: the verdict loop — one MCP tool,
   a local verdict store, per-reason drop counts out of fetch, and a
   first-seen timestamp on the seen index — with the CLI report that makes it
   measurable.
2. Resolve the spec 0003 contradiction by amending the boundary rule to the
   invariant that actually matters and making `check-boundaries` enforce it.

Also in force unless the founder objects: re-grades are latest-wins, no
history.

## Workstream 1 — the boundary rule

Branch: `chore/boundary-invariant`, worktree
`/var/folders/r3/j_9t7lbs16q_6n27lr5brwxh0000gn/T/opencode/wt-boundary`.
Member: release-warden. This branch touches no `src/` file.

### The contradiction

Spec `0003-application-core.md:100-101`, `AGENTS.md:33-35`, and
`.claude/skills/architecture-guardrails/SKILL.md:35-36` state: no file under
`src/interfaces` or `src/application` imports `node:fs` or calls `fetch`.
The tree violates the letter: `src/interfaces/cli/quality.ts:7` and
`src/interfaces/cli/demo.ts:10` import `node:fs`, and
`src/interfaces/cli/cli.ts:274` dynamically imports it to read a user-named
file for `fish profile set`. Nothing enforces the rule, so it silently
drifted. The fetch half holds: only `src/adapters/ats/providers.ts:11` calls
`fetch`.

### The amended rule (the invariant that matters)

- No file under `src/domain` or `src/application` imports `node:fs` or
  calls `fetch`.
- No file under `src/interfaces` calls `fetch`.
- No file under `src/interfaces/mcp` imports `node:fs`.
- `fetch` appears under `src/` only in `src/adapters`.
- `src/interfaces/cli` may import `node:fs` at the process edge, named
  explicitly: reading a user-named file (`profile set`), reading bundled
  package data (the eval fixtures behind `fish quality`), and the demo
  harness's temp home. Personal state still travels only through ports.

Rationale to keep in the wording: the rule exists to keep the application
core runnable over in-memory adapters, and the MCP server, which runs in a
host, honest about the same boundary. The CLI is the process edge. Replacing
an unenforced over-broad rule with an enforced precise one strengthens the
gate; do not weaken the allowlist behavior already in the script.

### Files and requirements

- `fish-career/scripts/check-boundaries.mjs`: extend enforcement to the rule
  above, preserving the existing allowlist check and failure style. A
  violation names the file and the rule.
- `fish-career/scripts/check-boundaries.test.mjs`: prove each rule fails on a
  violating fixture and that the real tree passes. Keep the existing tests
  green.
- `specs/0003-application-core.md`: amend the acceptance line and any prose
  that states the old rule; the amended rule is what is now enforced.
- `AGENTS.md`: the sentence at lines 33-35.
- `.claude/skills/architecture-guardrails/SKILL.md`: the rule statement;
  change only that, keep the skill's voice and scope.
- Regenerate the `.opencode/skill/` mirror with
  `npm --prefix fish-career run agents:sync`; `agents:check` must be green.
- Grep the repo (README.md, ARCHITECTURE.md if present, docs/) for other
  statements of the old rule and update any found.

## Workstream 2 — the verdict loop

Branch: `feat/verdict-loop`, worktree
`/var/folders/r3/j_9t7lbs16q_6n27lr5brwxh0000gn/T/opencode/wt-verdict-loop`.
Member: mcp-architect. Spec 0007 lands with this commit set.

### The operator surface

```text
$ fish fetch
<company>: <total> postings, <remote> remote, <new> new
<n> new postings written to the cache.
Dropped before writing: <k> not remote, <thin> too thin to score, <window> out of window.

$ fish arrivals
<company>: <title>   [<postingId>]
<n> ungraded arrivals.

$ fish arrivals grade <postingId> 2
recorded. <n> graded, <n> pending.

$ fish arrivals summary
<n> graded of <n> written (coverage <pct>)
precision@arrival   no read (n=<n> below the floor)
```

Above the floor (start at 45, an ESTIMATE from the advice run, a code
constant with the rubric's reviewability):

```text
precision@arrival   <pct>    (label >= 2 of <n> graded)
wilson 95%          [<lo>, <hi>]
```

### The rules that carry

- Grade scale is the eval's, verbatim: 3 act, 2 look, 1 miss, 0 should not
  surface (`fish-career/eval/labels.json:2-8`). Blockers stay a separate
  demotion; there is no "0 = blocked".
- A verdict is the human's ground truth at a time. The store mirrors the
  filesystem ledger's file discipline (tolerant parse, `ok:false` on
  corruption, atomic write) but inverts its staleness rule: provenance
  (`profileHash`, `rubric`, `at`) is recorded for reproducibility and never
  invalidates a verdict.
- The metric: precision@arrival counts label >= 2 over graded arrivals;
  coverage is graded over cached; every number null or "no read" rather than
  a guess when thin, matching `src/domain/metrics.ts`'s ethos. Never feed
  verdicts into `eval/expected-metrics.json` or `fish quality` — spec 0005's
  golden metrics stay separate.
- Drop accounting: split the collapsed `baseline` (`src/domain/admission.ts`)
  into out-of-window and thin-text reasons; non-remote drops happen before
  admission and are counted only; the recency bucket is degenerate after the
  first run and the code and spec say so. Nothing else about admission
  changes.
- Seen index gains `observedAt` (first-observation time, set when a posting
  is first marked seen and preserved thereafter). Freshness-lag reporting is
  not in this slice; the field is the prerequisite.
- MCP: exactly one new tool, `verdict_record`, snake_case per spec 0004,
  input `{ postingId, label 0-3 }`, an output schema, annotations per the
  existing conventions (readOnly false; decide destructive and idempotent by
  the conventions and defend it in the PR), and one stable error code for an
  unknown posting (reuse an existing code if one fits, else add one and
  enumerate it where spec 0004 says codes live). Amend spec 0004's ten-tool
  table to eleven and update its pinned tests.

### Files

`src/domain/verdicts.ts` and its test; `src/domain/admission.ts` and test;
`src/application/fetch-postings.ts`; `src/application/record-verdict.ts` (and
arrivals listing/summary use cases); `src/application/career-application.ts`;
`src/ports/stores.ts` (VerdictStore, `SeenEntry.observedAt`);
`src/adapters/filesystem/verdicts.ts`, `home.ts` (`state/verdicts.json`),
`seen-store.ts` if needed; `src/adapters/fake/in-memory.ts`;
`src/bootstrap/create-application.ts`; `src/interfaces/mcp/tools.ts`,
`schemas.ts`, `server.test.ts`; `src/interfaces/cli/cli.ts`, `cli.test.ts`;
`specs/0007-finding-quality.md`; `specs/0004-mcp-contract.md`;
`docs/mcp-migration.md` if a code is added. Update any doc that enumerates
the CLI commands or the tool list in the same commit.

### Non-goals, explicit

The A2UI card, LangGraph, the scheduler, the known-item probe, the directory
frame, freshness-lag reporting, verdict history, and any automatic tuning.
Architecture rules as amended by workstream 1 apply: no `node:fs` or `fetch`
in domain or application, no `fetch` in interfaces, no `node:fs` in the MCP
server, all state in `FISH_HOME` and none in the repo, the judge untouched,
posting text untrusted.

## Work order

1. Each member reads this file first, then bootstraps its worktree
   (`npm ci --prefix fish-career`) before any gate.
2. Each member works only its own file list and never touches the other
   worktree. A course correction may arrive from the coordinator.
3. Commits: explicit paths only, never `git add -A`; signed conventional
   commits (signing is configured); no AI attribution; no push — the
   coordinator pushes after fresh review.
4. `npm --prefix fish-career run health` must pass before the member reports;
   run long commands with an explicit timeout. If a gate fails, fix the work,
   never loosen the gate.
5. Report in the agreed shape with evidence labeled OBSERVED, CODE-READ, or
   ESTIMATE; commands and their outputs for anything claimed.
6. The coordinator verifies claims, dispatches fresh review on each branch
   (plus `fish-arbiter` for the verdict loop, which touches numbers and a
   user-facing surface), has the builders fix findings, then opens one PR per
   workstream. The founder lands.

## Outcome (build run, 2026-09-27/28)

Both workstreams landed on `main`: #37 squashed as `68ee5af`, #38 squashed as
`c0ff673` (including the CI unblock `c464dc7`, which wired the new `verdicts`
port into `examples/langgraph`). Combined main verified locally after the
merges: full `health` green, stdio smoke `11 tools, 6 resources, 5 prompts`,
and the example's typecheck and tests green.

Fresh review caught and the builders fixed before landing: an unreadable
verdict store could be treated as empty and overwritten; `fish arrivals grade
<id> ""` recorded 0; the `--all` first-run copy claimed a window that was not
applied; the smoke did not pin `verdict_record`; the boundary check missed
other I/O builtins and `.mts`/`.cts` files; `tsconfig.build.json` excluded
only `.test.ts`; and the spec's history sentence overreached.

Live proof, recorded on PR #38: on the real `FISH_HOME` with 461 ungraded
arrivals, one was graded (`recorded. 1 graded, 460 pending.`), summary
`1 graded of 461 written (coverage 0.2%)` / `precision@arrival no read (n=1
below the floor)` — the designed below-floor behavior.

Open, not decided here: the 461-arrival backlog means the verdict queue needs
a bounded, likely seeded and stratified draw before precision@arrival can
reach its floor; and `verdict_record` keeps `destructiveHint: true` unless the
founder rules otherwise.
