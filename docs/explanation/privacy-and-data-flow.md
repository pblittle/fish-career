# Privacy and data flow

fish.career runs on your machine as a stdio MCP server and a CLI. It holds no
account and opens no listening socket. A job search carries a profile you
would not publish and a history of who you looked at, so the design keeps
both on your disk and makes every outbound call a short, named list.

## What stays local

Everything fish reads and writes hangs off `FISH_HOME`
([the files](../reference/configuration.md#fish_home)). The npm package
holds none of it, and the repository ships fixtures only. Pointing
`FISH_HOME` at a private directory or a private checkout keeps personal state
out of any public tree, and lets two worktrees keep separate state.

## What leaves the machine

1. **ATS board reads.** GET requests to the four public, no-auth ATS APIs
   (Ashby, Greenhouse, Lever, SmartRecruiters) for the boards you watch or
   probe. The board slug is the only identifier sent: no profile, no key, no
   account.
2. **Judge calls.** One POST per scored posting to `api.typesafe.ai`,
   carrying your profile text, the posting text, and the typed rubric
   questions, with your API key in the `Authorization` header. This is the
   only place your judgment data leaves the machine. With `FISH_JUDGE=fake`
   there is no judge call at all.
3. **Optional trace mirror.** With `FISH_TRACE=langsmith` and
   `LANGSMITH_API_KEY` set, each judge call is also POSTed to
   `api.smith.langchain.com/runs`. The mirror carries posting IDs, posting
   and profile hashes, the model, attempts, token counts, the application
   version, and the typed answers, never the posting text or the profile
   text. The local `state/traces.jsonl` is always written and stays the
   source of truth; a failing mirror never fails a scoring run.

There is no telemetry, no analytics, no crash reporting, and no update check.
A host app you connect fish to (and any other server it runs, such as a web
search companion) makes its own calls under its own terms; fish's list does
not change.

## Threat model

Defended:

- **Secrets stay in `FISH_HOME/.env`.** The package publishes `dist/` and
  `eval/` only, and `verify:pack` fails the build if personal state or a
  `.env` appears in the tarball.
- **Posting text is untrusted data.** It is never executed and cannot change
  the pipeline's behavior. It reaches the judge, where typed answers, the
  separate blocker check, `?` for low confidence, and calibration against
  your own order are the defense against a posting that tries to
  prompt-inject. The bundled dataset includes one such posting, and it ranks
  last ([`specs/quality.md`](../../specs/quality.md)).
- **A posting ID cannot escape `postings/`.** An ID is checked against the
  cache-ID alphabet before any filesystem access.
- **No inbound surface.** The server speaks stdio to the host that launched
  it.

Out of scope, by design:

- **Local process trust.** Anything that can launch the server or read
  `FISH_HOME` can read your profile and postings and spend your API key.
  fish creates its files with your default permissions; restrict the
  directory yourself, and do not expose the server's stdio to a host you do
  not trust.
- **Encryption at rest.** State is plain files; use full-disk encryption if
  that matters.
- **Multi-user isolation and hosted operation.** One profile per
  `FISH_HOME`; a hosted product is governed by
  [ADR 0001](../adr/0001-product-boundary.md).
- **The judge provider's handling of your data.** Your profile and posting
  text go to TypeSafe under their terms, so keep secrets and contact details
  out of the profile.

## Forgetting

Delete the file that holds what you want gone: `state/traces.jsonl` for call
history, `state/scored.json` for scores, `state/verdicts.json` for verdicts,
`state/calibrations/` for calibration history, `postings/` for the cache, or
the whole `FISH_HOME` to reset.
