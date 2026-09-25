# Architecture

The decisions worth defending, and why they were made. Short on purpose: if a
decision isn't here, it wasn't one.

## One application core, many surfaces

```text
MCP over stdio ──┐
CLI ─────────────┼── CareerApplication (src/application)
Future hosted ───┤         │
Future API ──────┘         │
            ┌──────────────┼──────────────┐
            │              │              │
       ATS providers     Judge      Repositories,
       (ports)           (port)     ledger, traces
            │              │              │
      adapters/ats   adapters/judge  adapters/filesystem
```

```text
src/domain        pure policy: posting, rubric, answers, ranking,
                  preferences, calibration, ledger, admission, random, errors
src/ports         the interfaces the application may use
src/application   use cases: fetchPostings, rankPostings, evaluateRanking,
                  calibrateRanking, watchlist, postings, rubric summary
src/adapters      ats (four boards), judge (Jev, fake), filesystem, fake (in-memory)
src/interfaces    mcp (server), cli (commands, demo)
src/bootstrap     createApplicationFromHome, createServerFromHome
```

Every use case takes a dependencies object of ports; MCP, the CLI, and the
demo call the same methods. The demo runs the complete workflow through
in-memory adapters, which is what proves the core has no hidden dependency on
the filesystem, the network, or the clock.

**Why:** two surfaces over one copy of the logic cannot disagree. The
alternative (a CLI with its own fetch loop, an MCP server with its own)
produces a tool that scores differently depending on how you called it. That
is the failure this shape makes impossible rather than unlikely. The ports are
also what make the future hosted product an adapter swap rather than a
rewrite.

## One repository, not five

The engine and both surfaces live together.

**Why:** a split buys independent release cadence, ownership boundaries, and
separate permission scopes. One operator, one external dependency, one
release train. The split is all tax and no buyer. And the thing it costs is
exactly the thing named above: shared modules keep the surfaces honest;
separate repositories make drift the default.

**When it stops being right:** a real second consumer or a second maintainer.
The split triggers are enumerated in `docs/adr/0001-product-boundary.md`; the
short version is a hosted product, multi-user identity, private data, a
divergent release cadence, a second team, or billing and notification
infrastructure. The extraction is already cheap: the package publishes `dist/`
only, ships a `bin`, and owns no state, so "publish `fish-career` and depend on
it" is additive. Deferring the split is a decision; making the extraction cheap
is what pays for it.

## State lives outside the package

Everything read and written hangs off `FISH_HOME` (default `~/.config/fish`):
profile, watchlist, postings cache, `.env`, and `state/`. The npm install
holds none of it.

**Why:** an install that carries your candidate profile and your job search
history is a liability, and it breaks the moment two worktrees want different
state. An engine that is stateless and a home that is explicit gives you
reproducible runs and a gitignore you can read in one glance.

## The judge is untrusted

The judge is a port. The Jev adapter asks **typed questions, not a generated
paragraph**: five Score dimensions plus one Noul hard-blocker check in a single
request. The output is a structured answer per dimension, validated with a
runtime schema at the adapter boundary, not prose to be parsed for sentiment.

**Why:** prose scoring forces you to extract a number from a paragraph the
model wrote, and that extraction is where the dishonesty lives. A typed answer
per dimension is checkable, weightable, and disagreeable. A response missing a
dimension or carrying a non-finite score fails that posting loudly instead of
being clamped into a score nobody can explain. A `?` in the table means the
model was not confident; that is surfaced, not smoothed over. A blocker at
0.5+ demotes a row below every clean row whatever the composite says, because
an unmet hard requirement is not a matter of taste.

## Judgment is data

Weights, level descriptions, and blocker instructions live in `DIMENSIONS` in
`src/domain/rubric.ts` with a `RUBRIC_VERSION`. They are not scattered across
prompt strings or buried in a config nobody reads.

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

## There are three measurements, and the golden metrics are the acceptance test

- **`evaluate`**: holds the ranking to pairwise preferences that quote their
  own source line in the profile. No human step. Runs in CI against a golden
  slice of recorded judge answers, so **no network and no API key**.
- **`calibrate`**: optional and stronger per run. A hand-ranked slice, scored
  by the judge, reported as Spearman agreement. Where the two disagree, the
  disagreement is the tuning signal.
- **`quality`**: the labeled dataset (`fish-career/eval/`) measured with
  pairwise accuracy, Kendall tau, Spearman, precision@k, and nDCG@k, plus a
  weight-sensitivity pass. The recorded baseline's metrics are a golden
  fixture; a rubric change that moves them must update it deliberately, so
  the build fails until the change is owned.

**Why:** "the model scored some jobs" is not a claim about anything. The
measurements are what turn the rubric into something with an acceptance
criterion, and the golden fixtures are what keep the judge behind a test
boundary. The suite tests the pipeline's behavior against fixed answers, not
the model's mood.

## Smaller decisions

- **Stable posting IDs.** A posting's ID is its cache filename stem, and every
  ledger entry, trace, calibration, and protocol surface speaks IDs. Storage
  layout (`.txt` headers today, a database tomorrow) is an adapter detail;
  older ledgers and preferences that keyed on filenames are normalized on read.
- **One judge call per posting.** A run is long and a call is idempotent, so
  a 429, a 5xx, or a dropped connection costs a backoff and a retry; any other
  4xx is the request's own fault and throws at once. `fetchImpl` and
  `retryBaseMs` are injectable so the policy is tested without a network or
  real sleeps.
- **Calibration draws are seeded.** The seed is recorded with the pending
  slice, so the same slice can be redrawn and a disagreement re-examined.
- **Region-labelled variants collapse.** One vacancy in five offices is one row
  that names the other offices, not five rows in the top ten. A bare base title
  stays its own row, because hiding a distinct posting is worse than showing a
  duplicate.
- **Four providers, one posting shape.** Greenhouse, Ashby, SmartRecruiters,
  and Lever flatten to a single header plus body. The provider differences stay
  in `src/adapters/ats/providers.ts` where they belong.
- **The engine depends on the MCP SDK and `zod`.** The root CLI scripts are
  shims over the built `fish` CLI and add nothing of their own.
- **`MIN_SCORABLE_TEXT`.** A body too thin to judge is resolved through the
  provider's detail endpoint or baselined, never scored on nothing.

## Naming

`fish.career` names the product and the MCP server. The package is
`fish-career`, so the npm surface and the filesystem agree; the preferred CLI
command is `fish`. The domain is deliberately unregistered while the product is
hypothetical.

`fish.agency` is not part of this architecture. It was a placeholder for a
hypothetical parent platform and is retired by
`docs/adr/0001-product-boundary.md`.
