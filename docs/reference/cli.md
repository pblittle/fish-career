# Command line

Every `fish` command, with its flags, defaults, and exit codes. Each command
calls the same application use case as the matching MCP tool
([MCP surface](./mcp.md)), so a score means the same thing on both.

The package installs two names for one entry point, `fish` and
`fish-career`. From a source checkout without a global install, run
`node fish-career/dist/index.js` in place of `fish`. Every command reads
`FISH_HOME` ([configuration](./configuration.md)).

## Exit codes

| Code | When |
|---|---|
| 0 | The command ran, including a partial `triage` whose failures are printed, and `NOTHING_TO_SCORE` |
| 1 | A usage error, an unknown command (usage goes to stderr), any other refusal, or a `triage` that scored nothing and failed |

A refusal prints its message to stderr. The stable codes behind the messages
are in [the MCP error table](./mcp.md#error-codes).

## Server and help

```bash
fish            # start the MCP server over stdio
fish mcp        # the same
fish --help     # or -h: print usage
fish --version  # or -v: print the package version
```

## `fish fetch`

```bash
fish fetch [--company X]... [--days N | --all]
```

Polls every watched board, keeps remote postings, writes the ones never seen,
and prints one line per board, the arrival count, and the drops by reason
(not remote, off target, too thin to score, out of window).

| Flag | Effect |
|---|---|
| `--company X` | Poll only watched companies whose name contains `X`, case-insensitive; repeatable. No match is a refusal |
| `--days N` | Write only postings published in the last `N` days (positive number), and reconsider postings earlier polls dropped for their date |
| `--all` | No window, and the same reconsideration |

With neither window flag, the first poll uses 14 days and later polls none.
A posting dropped as too thin to score is never reconsidered.

## `fish triage`

```bash
fish triage [--rescore] [postingId...]
```

Scores postings with the judge and prints the ranked table, then the run ID.
With no IDs it scores the cached postings not yet scored under the current
profile and rubric, setting aside titles on the skip list. Named IDs are
scored whatever their title, and the ledger is neither read nor written.
`--rescore` scores every cached posting again. A `?` marks a dimension the
judge answered below 0.5 confidence; a blocker at 0.5 or above sorts the row
below every clean row and prints `<- check this one`.

## `fish arrivals`

```bash
fish arrivals                          # list ungraded postings with their IDs
fish arrivals grade <postingId> <0|1|2|3>
fish arrivals summary
```

A grade is the operator's verdict: 3 act on it now, 2 worth a look, 1 a miss,
0 should not surface. Any other token is refused before anything is written.
A second grade replaces the first. `summary` prints coverage (graded over
cached) and precision@arrival (the share of graded postings at 2 or above)
with a Wilson 95% interval, or `no read` below 45 graded.

## `fish recall`

```bash
fish recall <url...>
```

For each URL of a posting found elsewhere, prints the furthest stage it
reached in fish (written, dropped, not fetched, off target, not remote, not
listed, unreadable, not watched, board URL, other system, job site, unknown),
then the stages counted. A posting dropped for its date names the `fish
fetch --company X --days N` that reconsiders it. Only a posting fish never
saw costs a read, at most one per watched board per run.

## `fish evaluate`

```bash
fish evaluate
```

Scores the postings named in `preferences.json` and prints how many pairs the
ranking satisfies, quoting the source line of each violation.

## `fish quality`

```bash
fish quality [--k N] [--json]
```

Prints ranking quality against the bundled labeled dataset and its recorded
judge run: pairwise accuracy, Kendall tau, Spearman, precision@k, nDCG@k,
blocker ordering, the ranked table, and weight sensitivity. Offline, no key,
no state. `--k` is an integer from 1 to 50, default 5. `--json` prints the
report as JSON.

## `fish calibrate`

```bash
fish calibrate start [--count N] [--seed N]
fish calibrate submit <postingId...>
fish calibrate reuse
fish calibrate rescore
```

| Command | Effect |
|---|---|
| `start` | Draws a slice (`--count` 2 to 30, default 10) with a recorded seed (`--seed` any integer) and prints it numbered |
| `submit` | Takes every slice ID in your order, best first; scores the slice; prints Spearman rho and the biggest disagreements |
| `reuse` | Redraws the pending slice from its recorded seed |
| `rescore` | Re-scores the latest calibration under the current rubric and prints the previous and new rho |

## `fish watchlist`

```bash
fish watchlist list                       # the default
fish watchlist probe <slug>
fish watchlist add <url> [name]
fish watchlist add <name> <provider> <slug>
fish watchlist remove <name>
```

`add` reads one or two words whose first contains `.` or `/` as a URL and a
name; three words as a name, provider, and slug. Providers are `ashby`,
`greenhouse`, `lever`, and `smartrecruiters`. Adding a name or board already
watched prints that it is already there. `remove` matches the name
case-insensitively and keeps the cached postings.

## `fish profile`

```bash
fish profile get         # the default
fish profile set <path>  # replace the profile with the file at <path>
```

## `fish postings`

```bash
fish postings list                         # the default: ID, company, title
fish postings read <postingId>
fish postings explain <postingId> [--dry-run]
```

`explain` spends one judge call and prints the row, the raw typed answers,
and the token and latency cost. `--dry-run` prints the request it would send
(the state text, the model, the questions) and sends nothing. A `.txt` or
`.md` suffix on an ID is stripped.
