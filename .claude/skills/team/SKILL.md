---
name: team
description: "Assemble the fish.career build team on one goal: the session becomes the coordinator, writes a durable plan file, briefs the roles the goal needs, dispatches them in parallel on disjoint files, verifies their claims against the code, runs fresh review, and reports one synthesis with every disagreement kept. Use when asked to bring in the team, the agents, or everyone, or to run a goal that spans layers. Takes the goal as its argument: /team <what you want done>."
---

# The team

`/team <goal>` makes this session the COORDINATOR. The coordinator does not do
the specialists' work and does not relay their reports raw. It plans, briefs,
dispatches, verifies, commits what is finished, and tells the founder in a few
lines what landed, what is running, and what needs their call.

The gate, the commit rules, and the evidence rules live in `AGENTS.md`. Read
it first; this skill does not restate it.

## The roster

Each member reads its own brief and the plan file, never this conversation.
Carry what it needs in the brief.

| Member | Owns | Brings |
|---|---|---|
| `mcp-architect` | `src/interfaces/mcp/`, `src/ports/`, `src/bootstrap/create-server.ts` | the protocol contract: tools, resources, prompts, output schemas, annotations, error semantics, protocol tests |
| `evaluation-scientist` | `src/application/evaluate-ranking.ts`, `src/application/calibrate-ranking.ts`, `src/domain/rubric.ts`, `src/domain/calibration.ts`, `src/adapters/judge/`, `src/adapters/trace/`, `fish-career/eval/` | measurement: metrics, holdout sets, sensitivity, trace provenance, experiment tooling |
| `provider-engineer` | `src/adapters/ats/`, `src/domain/posting.ts` | provider contracts: normalization, empty and malformed boards, pagination, rate limits, duplicates, thin data |
| `docs-critic` | `README.md`, `docs/`, `specs/`, package docs (not `docs/plans/`) | claims versus implementation, onboarding, adoption and operations docs |
| `release-warden` | `.github/`, `fish-career/package.json`, `fish-career/scripts/`, release config | CI, packaging, tarball verification, the health gate, release and provenance |

The host's own general subagent is the sixth member: tests and docs for a
change another member made, dispatched onto that member's branch after it
commits, so the paired test lands in the same PR as the code.

A file has one owner per run. If two members need the same file, the
coordinator sequences them or has one own the interface change first.

Roles are carried in the brief rather than as host-native agent files, so the
same protocol works in Claude Code, opencode, and Codex. If a role starts
drifting across sessions, extract it to a host-native agent then, not before.

## The protocol

1. **Write the brief down first.** Put the goal, the founder's rulings in
   their words, the rules that do not move, the member assignments, and the
   work order in `docs/plans/<yyyy-mm-dd>-<slug>.md`. Commit it before
   dispatching. Every brief says "read the plan file first." A plan in chat
   dies when the context compacts; a plan in the repo does not.
2. **Pick the members the goal needs,** not everyone. Advice before build:
   when the question is "what should this be," send the position-taking member
   first and ask for a position, not a survey.
3. **Dispatch in parallel, in one message,** with files no other member
   touches, and name the forbidden files in the brief. Every member that
   writes runs in its own worktree when another writer runs at the same time:
   members in one checkout share HEAD and the index, and one member's
   `git add` or `git switch` can move another onto the wrong branch. A fresh
   worktree has no dependencies, so every writer's brief carries the bootstrap
   (`npm ci --prefix fish-career`) before any gate. Keep a writer's worktree
   until its review fixes land.
4. **Commit discipline, in every brief:** explicit paths only, never
   `git add -A`; signed conventional commits; no AI attribution; the gate
   (`npm --prefix fish-career run health`) passes before push.
5. **Relay course corrections the moment the founder gives them,** and say in
   the brief that a correction may arrive.
6. **Verify before you report.** Read what a member claims against the code
   and the command output. A member's report is model output, not proof.
7. **Review is fresh.** A builder never reviews its own work, and neither does
   the coordinator who briefed it. Run `/review` on each workstream's final
   committed branch, inside that member's worktree, and again after the fixes
   it produces. For a change that touches a claim, a number, a ranking, or a
   user-facing surface, also run `fish-arbiter` as a fresh reviewer. Review
   across model families where the host allows it; a model reviewing its own
   work rubber-stamps it.
8. **Synthesize, do not flatten.** Report where members converged, where they
   disagreed and why, and what needs the founder. Do not pass reports through
   whole.
9. **Keep the record true.** `README.md`, `ARCHITECTURE.md`, `specs/`, and the
   plan file change in the same commits as the code they describe, never ahead
   of it. The one exception is the plan file's first commit in step 1: it
   states intent, not built behavior.
10. **One PR per workstream, landed when it is green.** A reviewer reads one
    change at a time. Cut each member's work as its own branch from `main`, or
    from the one branch it truly depends on, and open it ready for review.
    Never hold finished work back to batch it. List any proof still owed on
    the founder's machine as an unchecked box under `## Owed before merge` in
    the PR body.

## What the founder does not want from a coordinator

- Menus of options where a recommendation belongs. Recommend, and ask only the
  one question that is theirs to answer.
- Mocks that are not the real thing, labelled as the real thing.
- Walls of relayed text.
- Stopping at a finding. A defect in the work the team was sent to do gets
  fixed by the team.

## Where a session is limited

There is no `TYPESAFE_API_KEY` and no model key in CI or a cloud session.
Tests, `quality`, and the demo use the fake judge and fake providers, and they
are the proof that runs anywhere. Live judge proofs run on the founder's
machine. Say which surface you ran on.
