# Pre-release cleanup: one contract, one front door, three specs

Date: 2026-09-28 · Run: `/team` · Plan branch: `plan/pre-release-cleanup`

Goal: make the repo read like one founder shipping a tool, not an AI simulating
an org. The source is an external review received 2026-09-28 and the founder's
cleanup plan relayed with it. The cleanup itself is the demonstration.

## The founder's rulings

- Delete `.claude/skills/` (all four) and `.opencode/skill/` — the same four
  ideas, duplicated verbatim.
- `.opencode/command/` — audit; if it is persona/workflow scaffolding, delete.
- Delete `CONTRIBUTING.md`; there are no outside contributors pre-launch.
- `docs/quality-report.md` — fold still-true findings into `ARCHITECTURE.md`
  or the quality spec, then delete the standalone doc if it is redundant.
- Collapse `specs/0001`–`0007` into three living docs by subsystem (pipeline,
  quality/ranking, MCP contract). Keep the content, drop the numbered-series
  format.
- `docs/getting-started.md`, `docs/privacy.md`, `docs/hosts/` — merge what is
  not already in README and delete the files.
- "Replace `AGENTS.md` with the version in this deliverable (or your edit of
  it) — same filename, so `CLAUDE.md`'s pointer still works."
- Keep and promote: `fish-career/eval/` and `examples/langgraph/` — link them
  from the README's first screen. `docs/adr/0001` stays.
- Sanity checks: a stranger gets what the tool is, why, and how to run it from
  README + ARCHITECTURE in ten minutes; nothing in the repo talks about "the
  team," "members," "the roster," or a named reviewer persona; no migration
  doc, deprecation notice, or prose implying a second consumer.
- Ruling on scope (2026-09-28): cleanup first; expanding
  `examples/langgraph/` is the next goal, not this run.

## Already done by the trim (PR #41, 0a3c85d) — verify, do not redo

- release-please, `publish.yml`, `examples.yml`, dependabot, the release
  configs: gone. Only `.github/workflows/test.yml` remains, and it carries the
  example steps.
- `docs/mcp-migration.md`: gone. `specs/0002` (demo mode): marked superseded.
- The founder's plan text naming "test, examples, publish, release-please"
  workflows is stale; nothing to restore or pause.

## Rules that do not move

- `npm --prefix fish-career run health` is what green means; nothing is pushed
  until it passes. If a gate fails, fix the work; do not loosen the gate.
- Explicit paths only (`git add <path>`), never `git add -A`. Signed,
  conventional commits; no AI attribution.
- Documentation changes in the same commit as the thing they describe.
- Personal state never enters the repo; posting text is untrusted data; the
  judge boundary stays structural.
- Evidence labels: OBSERVED, CODE-READ, ESTIMATE. A claim about code resolves
  to a file and a line; a claim about behavior to a command and its output.

## Target state (pinned interfaces)

Docs tree on `main` after both workstreams:

- `README.md` — the one front door: what it is, quickstart, the proof (eval
  metrics plus the LangGraph example) on the first screen, the walkthrough,
  host connects, privacy, limits.
- `ARCHITECTURE.md` — the decisions and why; absorbs folded findings that fit.
- `AGENTS.md` — the one operating contract: the founder's draft plus the
  operational rules this repo still needs (gate, commits, state/secrets,
  evidence).
- `CLAUDE.md` — one line, `@AGENTS.md` (Claude Code reads AGENTS.md natively
  since 2.1.277; the import covers sessions without native support).
- `specs/pipeline.md` ← 0001 + 0003 + 0006. `specs/quality.md` ← 0005 + 0007 +
  folded quality-report findings. `specs/mcp-contract.md` ← 0004. Spec 0002 and
  the seven originals are deleted.
- `docs/adr/0001-product-boundary.md` unchanged. `docs/plans/` holds run
  records only.
- `.claude/`, `.opencode/`, `CONTRIBUTING.md`, `docs/getting-started.md`,
  `docs/privacy.md`, `docs/hosts/`, `docs/quality-report.md` — gone.

The spec filenames are an interface: `AGENTS.md`, `check-boundaries.mjs`, and
`README.md` all cite `specs/pipeline.md`. Neither writer invents a name.

## Workstreams

### W1 — release-warden: one agent contract (`chore/one-agent-contract`)

Owns, exclusively:

- `.claude/**`, `.opencode/**`, `CLAUDE.md`, `AGENTS.md`
- `fish-career/package.json`
- `fish-career/scripts/sync-agent-layer.mjs` and its test (delete)
- `fish-career/scripts/check-boundaries.mjs` and its test
- `.github/workflows/test.yml`, `.gitignore`
- `fish-career/CHANGELOG.md` only if migration language is found (none is).

Tasks:

1. Delete the four skill directories in both mirrors and
   `.opencode/command/team.md` (it is only the team wrapper).
2. Delete `sync-agent-layer.mjs` and its test. In `package.json` remove
   `agents:sync`, `agents:check`, and `agents:check` from the `health` chain,
   and drop the `.claude/skills` glob from `lint:md`. Drop the `agents:check`
   step from CI. Remove the dead `!/.claude/skills/` negation from
   `.gitignore` (keep `/.claude/*` as protection for local tool config).
3. Rewrite `AGENTS.md` from the founder's draft, with the false
   "release-please handles versioning" line corrected and the gate, commit
   rules, state/secrets boundary, and evidence labels kept. No personas.
4. Rewrite `CLAUDE.md` to the single line `@AGENTS.md`.
5. Replace `spec 0003` phrasing in `check-boundaries.mjs` and its test with
   `specs/pipeline.md`.

### W2 — docs-critic: one front door, three specs (`docs/one-front-door`)

Owns, exclusively:

- `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md` (delete)
- `docs/**` except `docs/plans/**`
- `specs/**`
- `fish-career/README.md`, `fish-career/eval/README.md`,
  `examples/langgraph/README.md`

Tasks:

1. Collapse the specs to the three pinned files, by subsystem; keep contract
   and acceptance substance (the I/O boundary acceptance rule verbatim in
   `specs/pipeline.md`); no RFC numbering; fix cross-references; delete 0002
   and the originals.
2. Delete `CONTRIBUTING.md`; its commit rules live in AGENTS.md (W1). README
   points at AGENTS.md instead.
3. Fold the still-true quality-report findings (metrics, the disagreements,
   the injection result) into `specs/quality.md`/`ARCHITECTURE.md`, then
   delete the file. README keeps the headline numbers.
4. Merge `docs/getting-started.md` into README without losing a command or
   the profile skeleton; merge the privacy facts and threat model into
   README (or ARCHITECTURE where it fits) and delete the file; merge the
   three host pages into one compact README block and delete the directory.
5. Put the proof on the first screen: `fish-career/eval/` with the headline
   metrics, and `examples/langgraph/`, before the long sections.
6. Fix stale claims left by the trim: `ARCHITECTURE.md`'s "root CLI scripts
   are shims" line and specs/0001's copy of it, plus any dangling reference
   to a deleted file.
7. Do not touch `docs/plans/**`.

## Work order and landing

- This plan is committed to `plan/pre-release-cleanup` first; both writers
  start from `origin/main` in their own worktrees (fresh checkout:
  `npm ci --prefix fish-career`).
- W1 and W2 run in parallel on disjoint files. Neither touches the other's
  list.
- One PR per workstream, base `main`, ready for review, CI green. Land W1
  first, W2 immediately after, so the new spec pointer is true on `main` in
  one sitting.
- After both land: run the gate once on merged `main`, then the sanity checks
  (rg for persona/roster language, migration prose, dangling links; the
  ten-minute read of README + ARCHITECTURE).

## Review

- A fresh reviewer per branch — neither the builder nor the coordinator.
  Run `codex review` and/or a fresh Claude session for a cross-family second
  opinion, verify each finding against the branch, and relay only what
  survives. Fixes are made by the original builder.

## Next goal (deferred by founder ruling)

- Expand `examples/langgraph/` — the artifact most relevant to the audience —
  with its own goal and its own spec.
