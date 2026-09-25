# 0002: demo mode, a credential-free end-to-end run

Status: accepted · 2026-09-25

## Problem

A new user cannot see the product work without first getting a TypeSafe API
key and writing a candidate profile. The five-minute install therefore has a
ten-minute prerequisite, and the README has to explain scoring before it can
show it. A reviewer, a contributor, or a curious user should be able to watch
the real pipeline (fetch, triage, evaluate, calibrate) run to completion with no
credentials and no network.

## Contract

- `fish-career demo [--keep]` runs the real pipeline over bundled fixtures:
  the real fetch engine, the real scoring and ranking code, the real
  preference evaluation, and the real calibration comparison.
- The demo copies its fixtures into a fresh temp directory, uses it as
  `FISH_HOME` for the run, and removes it unless `--keep` is passed. The
  user's real state is never read or written.
- No network: the fixture provider reads `demo/postings/`, and the judge is a
  deterministic stand-in (`src/fake-judge.ts`) that answers the same typed
  questions with inspectable string rules. The demo says so in its first
  lines; it never implies a model ran.
- The fixture set is real public board data (LangChain's Ashby board) plus a
  generic stand-in profile, and it exercises the cases the rubric exists for:
  regional variants of one role collapsing, a remote posting outside the
  stated geography, hybrid postings filtered by the provider's remote flag,
  and compensation stated in the posting body rather than the board header.
- The output ends with the four stages named in order, a ranked table, the
  preference result, and the Spearman agreement of the calibration slice.
- `fish-career --version` and `fish-career --help` print version and usage;
  every other invocation starts the MCP server over stdio, unchanged.

## Non-goals

- The demo is not a benchmark of ranking quality. The stand-in judge is not
  Jev, and its ranking is a demonstration, not a claim about any posting.
- The demo does not mock the MCP surface; it exercises the engine the MCP
  tools call.
- The demo does not replace live evaluation; `evaluate` against a real key
  remains the acceptance test for ranking quality.

## Acceptance

- `node dist/index.js demo` exits 0 with no `TYPESAFE_API_KEY` and no network
  access, and prints a ranked table.
- `npm --prefix fish-career test` covers the demo with the global `fetch`
  stubbed to throw, so a regression that adds a network call fails CI.
