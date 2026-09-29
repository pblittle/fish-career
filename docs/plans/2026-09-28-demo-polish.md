# 2026-09-28 — LangChain demo polish

Status: intent until merged. One build workstream, one read-only position, one
metadata change held by the coordinator.

## Goal

The founder shows this repository to a LangChain team today as evidence for a
senior deployed architect role. Clean up and tighten: the front door must be
accurate and quick to read; the docs must be fresh — enough for an engineer to
understand and start working, not more. UX is explicitly later.

Founder's words: "i am going to show this to a team at LangChain today. is
there anything else that i can do to demonstrate that i am a solid candidate
for a senior deployed architect role? i was thinking more along the lines of
cleaning up, tightening up. for example, the repo description seems off. then
we can talk about UX. also, are docs fresh. not too much information, but
enough for a developer/engineer to understand and start working."

## Facts the coordinator established

- The GitHub About description, the `fish-career/package.json` description,
  and the README opening sentence are the same 26-word run of clauses. Whether
  it is off is for the reviewer to judge and the builder to fix once.
- GitHub topics are `career, jev, mcp, mcp-server, ats, job-search`. `jev` and
  `ats` are internal jargon, and no topic says LangGraph, evals, or
  TypeScript. The homepage field is empty.
- The root `fetch.mjs`, `probe-boards.mjs`, and `triage.mjs` are intentional
  shims over the CLI (spec 0003:82, README:175). Not clutter; leave them.
- Personal working state (`postings/`, `state/`, `profile.md`, `resume-clean.md`,
  `*.log`) is gitignored and untouched. Nothing personal is tracked.
- The CHANGELOG is release-please managed. Do not touch it.

## Workstream 1 — position, read-only: the LangChain reviewer

The goal is "what should this be" for the front door, so a position comes
first. Simulate a senior engineer at LangChain opening this repository cold,
evaluating both the project and the person for a senior deployed architect
role: architecture judgment, evaluations, agent orchestration, MCP fluency,
production discipline, documentation.

Report, 500 words max: the 30-second first impression; what confuses or reads
stale in the first five minutes; the strongest artifacts, ranked, with the
role-competency each demonstrates; the five questions you would ask the
founder; a proposed one-line description and topic set for the GitHub About;
and the single change with the best return before the meeting.

## Workstream 2 — build: docs, front door, and freshness

Branch `docs/front-door`, worktree
`/var/folders/r3/j_9t7lbs16q_6n27lr5brwxh0000gn/T/opencode/wt-front-door`.
Member: docs-critic. A correction may arrive carrying the reviewer's findings.

Files the member owns: `README.md`, `fish-career/README.md`, `ARCHITECTURE.md`,
`CONTRIBUTING.md`, `CLAUDE.md`, `docs/**` except `docs/plans/` and
`docs/adr/` (the ADR is a historical decision; only correct it if it is
factually wrong about today's behavior), the `description` field of
`fish-career/package.json`, and `specs/**` only where a claim is false about
today's code — report any such case before changing it.

The mandate:

- Front door. A senior engineer must learn what this is, why it exists, and
  how to run it from the first screen of the README. Verify every link and
  anchor; verify every command named exists in the CLI (`fish --help`) or the
  MCP surface (eleven tools). Move deeper material to `docs/` rather than
  deleting it; the README may end with a short "where to look next" list.
- Freshness. Check each doc against the merged code: the verdict loop
  (`fish arrivals`, `arrivals grade`, `arrivals summary`, `verdict_record`),
  the eleven tools, the amended spec 0003 boundary rule, the drop reasons, and
  `observedAt`. Anything that claims behavior the code does not have is a
  defect; anything true but stale in wording gets corrected.
- Tightening. Plain words, the product's voice, no marketing. Remove
  duplication between README, `fish-career/README.md`, and `docs/`. Enough to
  start working; not more.
- Hard limits. No UX changes, no feature changes, no code changes, no spec
  rewrites, no CHANGELOG, no `docs/plans/`, no GitHub metadata (the
  coordinator holds that).

Deliverable: one commit set on `docs/front-door`, the full gate green
(`npm --prefix fish-career run health`), no push. Report the changes, the
claims verified, and anything deliberately left alone.

## Fresh review

After the builder commits, a fresh reviewer checks the diff against the code
and checks every changed claim, link, and command; the arbiter lens applies
because docs are claims. Findings go back to the builder; the branch is
re-reviewed after fixes.

## Coordinator

After the wording is frozen: update the GitHub About (description and topics),
open the PR, and report the demo talk track — what to open, in what order, and
which artifact proves which competency.

## Non-goals

UX, features, code, specs-as-contracts, release metadata, personal files.
