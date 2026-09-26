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
on every PR: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`,
`ci:`, `chore:`, `style:`. Scopes in use: `fetch`, `triage`, `eval`,
`mcp`, `cli`, `core`, `package`, `agents`, `skills`. Subjects are lowercase,
descriptive, and may run long:
say what changed and why, not "fix bug".

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
verification, the agent-layer drift check, and the credential-free demo. CI
runs the same set on Node 20 plus a stdio smoke and an Inspector discovery
call, and repeats test, typecheck, and build on Node 22 and 24. `AGENTS.md` is
the full operating contract.

Skill files under `.claude/skills/` are mirrored to `.opencode/skill/`; after
editing a skill run `npm --prefix fish-career run agents:sync`, and
`agents:check` (already inside `health`) fails when the two drift.

Tests are not optional. A layer of work that cannot be tested is a design
problem, not a testing problem.

## Releases

release-please reads conventional commits on `main` and opens a release
PR (version bump + changelog). Merging that PR tags `vX.Y.Z` and cuts
the GitHub release. Never hand-tag.

Publishing to npm runs from the release workflow with trusted publishing
(OIDC, provenance, no stored token). It is gated on the repository
variable `NPM_PUBLISH_ENABLED` being `true`, so releases do not fail
before the package is configured:

1. On npmjs.com, add a trusted publisher for `fish-career`: repository
   `pblittle/fish-career`, workflow `release-please.yml`.
2. Set the repository variable `NPM_PUBLISH_ENABLED=true`
   (`gh variable set NPM_PUBLISH_ENABLED --body true`).
3. The next release publishes automatically; a manual run of the
   `publish` workflow also works.
