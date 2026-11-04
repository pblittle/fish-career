# Configuration and state

Everything fish reads and writes lives under one directory, `FISH_HOME`, and
a few environment variables choose the judge and the trace mirror. The
package itself holds no state. What leaves the machine, and why, is in
[Privacy and data flow](../explanation/privacy-and-data-flow.md).

## `FISH_HOME`

Set `FISH_HOME` to choose the directory. Unset, it is `~/.config/fish`,
which is also the config directory of the fish shell; point `FISH_HOME`
elsewhere if you use that shell. fish creates `postings/` and `state/` on
first run with your default file permissions, and creates nothing else
until a command writes it.

| Path | Written by | Format |
|---|---|---|
| `profile.md` | `profile set`, `profile_update` | Markdown, sent verbatim to the judge |
| `watchlist.json` | `watchlist add` and `remove` | `{ "companies": [{ "name", "provider", "slug" }] }` |
| `preferences.json` | you | `{ "preferences": [{ "better", "worse", "source" }] }`, posting IDs and the profile line each pair comes from |
| `skip-titles.txt` | you | One title phrase per line; `#` starts a comment |
| `.env` | you | Environment variables, read at startup |
| `postings/<postingId>.txt` | `fetch` | A posting: header lines, a blank line, the body |
| `state/seen.json` | `fetch` | Every remote posting a poll observed |
| `state/scored.json` | `triage` | The ledger: one score per posting with its provenance |
| `state/traces.jsonl` | every judge call | One JSON record per line |
| `state/verdicts.json` | `arrivals grade`, `verdict_record` | One verdict per posting |
| `state/calibration-pending.json` | `calibrate start` | The slice awaiting your order |
| `state/calibrations/<time>.json` | `calibrate submit` and `rescore` | One calibration record each |

### Hand-edited files

- **`watchlist.json`**: an entry without a non-empty `name`, a `provider`,
  and a `slug` is skipped on read, so a poll still runs over the valid
  ones. While any entry is malformed, or the file does not parse, `add` and
  `remove` refuse to write over it.
- **`preferences.json`**: an entry missing `better`, `worse`, or `source` is
  skipped. A `.txt` suffix on an ID is stripped.
- **`skip-titles.txt`**: a phrase matches a title when its words appear side
  by side and in order, whole words, in any case. `designer` matches
  "Product Designer II" and not "Director, Product Design". A missing file
  skips nothing; a file that cannot be read fails the fetch or triage that
  reads it.

### Postings

A posting ID is the cache file's stem: lowercase letters, digits, and single
hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), built from the company name and the
provider's posting key. Anything else is refused before it reaches the
filesystem. The file starts with this header:

```text
TITLE: <title>
COMPANY: <company>
LOCATION: <location>
COMPENSATION: <the provider's structured range, the first range the body states, or "not stated">
URL: <the page a person opens>
PUBLISHED: <first publication time>

<body>
```

### State

- **`seen.json`** keys a posting by the board's own key:
  `ashby:<slug>:<id>`, `gh:<slug>:<id>`, `lever:<slug>:<id>`, or
  `sr:<slug>:<id>`. A
  written posting records `title`, `date`, `file`, and `observedAt` (first
  observation). One a poll saw and did not write records `observed: true`
  and `dropped`, either `thin-text` or `out-of-window`.
- **`scored.json`** maps a posting ID to `{ score, profileHash, rubric, at }`.
  The profile hash covers the profile text and the rubric itself, so editing
  either makes the entry stale and the next triage scores it again. A ledger
  that does not parse is never overwritten.
- **`traces.jsonl`** records `at`, `runId`, `postingId`, `postingHash`,
  `status`, `latencyMs`, `attempts`, `inputTokens`, `outputTokens`, `model`,
  `profileHash`, `rubric`, `version`, and `answers` or `error`. One `runId`
  joins the calls of one scoring run. This file is the source of truth for
  every score.
- **`verdicts.json`** maps a posting ID to `{ postingId, label, profileHash,
  rubric, at }`. A verdict never goes stale. A file that does not parse
  refuses every new verdict rather than being overwritten.

## Environment variables

Set these in the environment or in `$FISH_HOME/.env`.

| Variable | Effect |
|---|---|
| `FISH_HOME` | The state directory (above) |
| `TYPESAFE_API_KEY` | The judge key. Empty, the `.env.example` placeholder, or an unresolved reference such as `op://...` counts as no key |
| `FISH_JUDGE` | `fake` uses the deterministic stand-in judge and ignores the key |
| `FISH_TRACE` | `langsmith` mirrors every judge call to LangSmith, when `LANGSMITH_API_KEY` is set |
| `LANGSMITH_API_KEY` | The LangSmith key for the mirror |
| `LANGSMITH_PROJECT` | The LangSmith project; default `fish-career` |

With neither a usable key nor `FISH_JUDGE=fake`, every command that scores
refuses with `NO_JUDGE`; fetching, grading, and reading still work. The
judge is TypeSafe's `jev-latest` model at `api.typesafe.ai`, with a 30-second
timeout and up to three attempts on a 429, a 5xx, or a dropped connection.
Setting up each: [How to configure the judge](../how-to/configure-the-judge.md).
