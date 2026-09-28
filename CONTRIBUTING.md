# Contributing

## Commits are signed

Every commit carries an SSH signature. One-time setup:

```sh
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
```

GitHub shows a Verified badge when the same key is registered as a
signing key in your account settings (the key may be both an
authentication key and a signing key).

## Commits are conventional

CI enforces [Conventional Commits](https://www.conventionalcommits.org)
on every PR. The types are the eleven in `commitlint.config.js`: `build`,
`chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`,
`test`. Scopes are free-form. Subjects are lowercase, descriptive, and may
run long: say what changed and why, not "fix bug".

## Specs come first

A behavior change lands with a spec in `specs/` (start from
`specs/0001-posting-pipeline.md`). The PR template asks for the link. A
change without a spec is a draft.

## PRs only

`main` takes no direct pushes. Branch, PR, green CI.

## Setup and the gate

```sh
npm ci --prefix fish-career
npm --prefix fish-career run health   # what green means here
```

`health` runs lint, typecheck, test, markdownlint, build, the pack
verification, the agent-layer drift check, and the dependency-boundary check.
CI runs the same set on Node 20, plus the LangGraph example's install,
typecheck, and test, a stdio smoke, and an Inspector discovery call, and
repeats test, typecheck, and build on Node 22 and 24. `AGENTS.md` is the full
operating contract.

Skill files under `.claude/skills/` are mirrored to `.opencode/skill/`; after
editing a skill run `npm --prefix fish-career run agents:sync`, and
`agents:check` (already inside `health`) fails when the two drift.

Tests are not optional. A layer of work that cannot be tested is a design
problem, not a testing problem.
