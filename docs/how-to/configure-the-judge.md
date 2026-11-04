# How to configure the judge

Switch scoring from the stand-in judge to TypeSafe's real one, optionally
keep the key in 1Password, and optionally mirror every judge call to
LangSmith.

## Prerequisites

- A `FISH_HOME` with a profile ([configuration](../reference/configuration.md)).
- At least one cached posting (`fish fetch`), to check the setup against.
- A TypeSafe API key from <https://console.typesafe.ai/keys>. Each scored
  posting is one judge call on your account.

## Steps

1. Put the key in `$FISH_HOME/.env`, and remove any `FISH_JUDGE=fake` line,
   which takes precedence over a key:

   ```text
   TYPESAFE_API_KEY=<your key>
   ```

2. To keep the key in 1Password instead, write a secret reference and run
   fish through `op`, which resolves it:

   ```text
   TYPESAFE_API_KEY=op://<vault>/<item>/credential
   ```

   ```bash
   op run --env-file="$FISH_HOME/.env" -- fish triage
   ```

   Run without `op`, the reference counts as no key, and fish never sends it
   to the judge.

3. To mirror judge calls to LangSmith, add:

   ```text
   FISH_TRACE=langsmith
   LANGSMITH_API_KEY=<your LangSmith key>
   LANGSMITH_PROJECT=fish-career
   ```

   The mirror carries hashes, the model, token counts, and the typed answers,
   never the posting or profile text
   ([Privacy and data flow](../explanation/privacy-and-data-flow.md)).

## Verification

See the exact request without spending anything, then spend one call:

```bash
fish postings explain <postingId> --dry-run
fish postings explain <postingId>
```

The dry run prints the profile and posting text the judge would read, the
model (`jev-latest`), and the questions. The real run prints the scored row,
the raw answers, and a `cost:` line with tokens, latency, and model. Every
call is also recorded in `$FISH_HOME/state/traces.jsonl`.

## Troubleshooting

- **`No judge is configured.`** No usable key reached fish: the line is
  missing, still holds the `.env.example` placeholder, or is an `op://`
  reference run without `op run`.
- **`judge API responded 401`.** The key reached TypeSafe and was refused.
  Check it in the console.
- **`judge call failed after 3 attempts`.** A network failure, a 429, or a
  5xx persisted through three tries with backoff. A partial `fish triage`
  keeps every row it scored; run it again to score the rest.
- **`judge response failed validation`.** The judge returned an answer off a
  dimension's ladder or missing a field. That posting fails rather than being
  given a score nobody can explain; the others in the run are unaffected.
- **`langsmith trace failed`.** The mirror could not write. Scoring
  continues and the local trace is complete.
