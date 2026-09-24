# Architecture

The decisions worth defending, and why they were made. Short on purpose: if a
decision isn't here, it wasn't one.

## One engine, two surfaces

```
fetch.mjs  triage.mjs          index.ts (MCP server)
     \        |                      /
      \       |                     /
       v      v                    v
        fish-career/src  ← the engine
```

The engine is eight modules (`fetch`, `triage`, `jev`, `ledger`, `evaluate`,
`compare`, `providers`, `config`). The two CLI scripts and the MCP server are
thin surfaces that import it. Nothing is reimplemented in either surface.

**Why:** two surfaces over one copy of the logic cannot disagree. The
alternative (a CLI with its own fetch loop, an MCP server with its own)
produces a tool that scores differently depending on how you called it. That
is the failure this shape makes impossible rather than unlikely.

## One repository, not five

The engine and both surfaces live together.

**Why:** a split buys independent release cadence, ownership boundaries, and
separate permission scopes. One operator, one external dependency, one
release train. The split is all tax and no buyer. And the thing it costs is
exactly the thing named above: shared modules keep the surfaces honest;
separate repositories make drift the default.

**When it stops being right:** a second consumer with its own cadence (the
platform this module feeds) or a second maintainer. The extraction is already cheap:
the package publishes `dist/` only, ships a `bin`, and owns no state, so
"publish `fish-career` and depend on it" is additive. Deferring the split is
a decision; making the extraction cheap is what pays for it.

## State lives outside the package

Everything read and written hangs off `FISH_HOME` (default `~/.config/fish`):
profile, watchlist, postings cache, `.env`, and `state/`. The npm install
holds none of it.

**Why:** an install that carries your candidate profile and your job search
history is a liability, and it breaks the moment two worktrees want different
state. An engine that is stateless and a home that is explicit gives you
reproducible runs and a gitignore you can read in one glance.

## The judge is untrusted

Jev is called with **typed questions, not a generated paragraph**: five Score
dimensions plus one Noul hard-blocker check in a single request. The output is
a structured answer per dimension, not prose to be parsed for sentiment.

**Why:** prose scoring forces you to extract a number from a paragraph the
model wrote, and that extraction is where the dishonesty lives. A typed answer
per dimension is checkable, weightable, and disagreeable. You can look at the
per-dimension probabilities and see exactly where the ranking came from. A
`?` in the table means the model was not confident; that is surfaced, not
smoothed over. A blocker at 0.5+ demotes a row below every clean row whatever
the composite says, because an unmet hard requirement is not a matter of taste.

## Judgment is data

Weights, level descriptions, and blocker instructions live in `DIMENSIONS` in
`jev.ts` with a `RUBRIC_VERSION`. They are not scattered across prompt strings
or buried in a config nobody reads.

**Why:** a rubric you cannot argue with is a rubric you cannot fix. Putting it
next to the code that uses it means a weight change is a diff, reviewable in a
PR like anything else. The version number is what makes the next decision work.

## Every score carries provenance

Each ledger entry records the `profileHash` and `rubric` version that produced
it. Change either and the entry is stale, and stale entries re-score on the
next run.

**Why:** a ranking is a claim about a specific profile under a specific rubric.
Without provenance you get a table where half the rows answer a question you
are no longer asking and nothing tells you which half. Invalidation is
automatic so the operator never babysits it. A crash costs at most the row in
flight, because every row checkpoints the moment it is scored.

## There are two measurements, and the eval is the acceptance test

- **`evaluate`**: holds the ranking to pairwise preferences that quote their
  own source line in the profile. No human step. Runs in CI against a golden
  slice of recorded judge answers, so **no network and no API key**. A change
  that breaks the operator's stated judgment fails the build.
- **`calibrate`**: optional and stronger. A hand-ranked slice, scored by Jev,
  reported as Spearman agreement. Where the two disagree, the disagreement is
  the tuning signal.

**Why:** "the model scored some jobs" is not a claim about anything. The eval
is what turns the rubric into something with an acceptance criterion, and the
golden fixture is what keeps the judge behind a test boundary. The suite
tests the pipeline's behavior against fixed answers, not the model's mood.

## Smaller decisions

- **One judge call per posting.** A run is long and a call is idempotent, so
  a 429, a 5xx, or a dropped connection costs a backoff and a retry; any other
  4xx is the request's own fault and throws at once. `fetchImpl` and
  `retryBaseMs` are injectable so the policy is tested without a network or
  real sleeps.
- **Regional variants collapse.** One vacancy in five offices is one row that
  names the other offices, not five rows in the top ten.
- **Four providers, one posting shape.** Greenhouse, Ashby, SmartRecruiters,
  and Lever flatten to a single header plus body. The provider differences
  stay in `providers.ts` where they belong.
- **The root CLIs have no runtime dependencies.** The engine depends on the
  MCP SDK and `zod`; the scripts you type into a shell depend on nothing.
- **`MIN_SCORABLE_TEXT`.** A body too thin to judge is resolved through the
  provider's detail endpoint or baselined, never scored on nothing.
