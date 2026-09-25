# Privacy and data flow

fish.career is a local-first tool. It runs as a stdio MCP server on your
machine, holds no account, and sends nothing anywhere except the two calls
below. This document states what is stored, what leaves the machine, and what
the threat model does and does not cover.

## What is stored, and where

Everything hangs off `FISH_HOME` (default `~/.config/fish`). The npm package
holds no state at all.

| Path | Contents |
|---|---|
| `profile.md` | Your candidate profile, sent verbatim to the judge when scoring |
| `watchlist.json` | Companies you watch, with provider and board slug |
| `preferences.json` | Pairwise preferences the ranking must satisfy, each with its source line |
| `.env` | `TYPESAFE_API_KEY`, read at startup |
| `postings/` | Cached posting text from public ATS APIs |
| `state/seen.json` | Every posting observed, so polls deliver arrivals only |
| `state/scored.json` | Ledger of scores with profile hash and rubric version |
| `state/traces.jsonl` | One record per judge call: latency, tokens, raw answers |
| `state/calibrations/` | Human rankings and their agreement with the judge |

The public repository ships fixtures only. Point `FISH_HOME` at a private
checkout to keep personal state out of any public tree.

## What leaves the machine

1. **ATS board reads.** GET requests to the four public, no-auth ATS APIs
   (Greenhouse, Ashby, SmartRecruiters, Lever) for the boards you watch. The
   board slug is the only identifier sent; no profile, no key, no account.
2. **Judge calls.** One POST per scored posting to `api.typesafe.ai`,
   carrying your profile text, the posting text, and the typed rubric
   questions, with your API key in the `Authorization` header. This is the
   only place your judgment data leaves the machine.

3. **Optional trace mirror.** With `FISH_TRACE=langsmith` and
   `LANGSMITH_API_KEY` set, each judge call is also POSTed to
   `api.smith.langchain.com/runs`. The mirror carries posting IDs, posting
   and profile hashes, the model, attempts, token counts, the application
   version, and the typed answers, but never the posting text or the profile
   text. The local JSONL trace is always written and remains the source of
   truth; a failing mirror never fails a scoring run.

There is no telemetry, no analytics, no crash reporting, and no update check.
The server opens no listening socket; it speaks stdio to the host that
launched it.

## Threat model

**In scope, defended:**

- **Secrets stay out of the package and the public repository.** The key
  lives in `FISH_HOME/.env`; the package publishes `dist/` and `demo/` only,
  and the pack verification fails if personal state or `.env` appears in the
  tarball.
- **Posting text is untrusted data.** It is never executed, and it cannot
  change the pipeline's behavior. It is passed to the judge, which means a
  posting could try to prompt-inject the judge; the mitigation is structural:
  answers are typed numbers per dimension with confidences, the blocker check
  is separate, low-confidence cells are surfaced as `?`, and the calibration
  loop exists precisely to detect a judge that has stopped tracking your
  judgment.
- **Path safety.** Posting identifiers are sanitized before any filesystem
  access, and reading a posting strips directory components. The postings
  directory is the only cache the server writes to.
- **No inbound surface.** stdio transport only; nothing to port-scan.

**Out of scope, by design:**

- **Local process trust.** Anything that can launch the server or read
  `FISH_HOME` can read your profile and postings and spend your API key.
  Protect the directory with normal file permissions; do not run the server
  as another user or expose its stdio to an untrusted host.
- **Encryption at rest.** State is plain files. Use full-disk encryption and a
  private checkout if that matters to you.
- **Multi-user isolation, tenancy, and hosted operation.** Those are the
  private product's concerns, gated by
  [`docs/adr/0001-product-boundary.md`](./adr/0001-product-boundary.md).
- **The judge provider's handling of your data.** Your profile and posting
  text go to TypeSafe under their terms. Do not put secrets in the profile,
  and treat the key as scoped to this use.

## Forgetting

Delete the corresponding files to forget: `state/traces.jsonl` for call
history, `state/scored.json` for scores, `state/calibrations/` for calibration
history, `postings/` for the cache, and the whole `FISH_HOME` to reset.
