# How to change the rubric

Change a weight, a criterion, or the blocker instructions, and land it with
the measurement that shows what the change did to ranking quality.

## Prerequisites

- A checkout with dependencies (`npm ci --prefix fish-career`).
- For a change to what the judge is asked (a dimension's instructions or
  criteria, or the blocker instructions): a TypeSafe key, because the
  recorded judge run must be re-recorded, which spends real credits.

## Steps

1. Edit `DIMENSIONS` or `BLOCKER_INSTRUCTIONS` in
   `fish-career/src/domain/rubric.ts`. Weights must still sum to 1; the
   `weights sum to 1` test fails otherwise.

2. Bump `RUBRIC_VERSION` in the same file when a dimension, a criterion, or
   the blocker instructions change meaning. Nothing enforces the bump. Stored
   scores go stale either way, because the profile hash every ledger entry
   carries covers the whole rubric; the version is what records name.

3. Run the tests and read what moved:

   ```bash
   npm --prefix fish-career test
   ```

   `the recorded quality baseline > matches the golden metrics` fails
   whenever the change moves a metric. That failure is the point: it holds
   the build until the change is owned.

4. If you changed what the judge is asked, re-record its answers over the
   dataset:

   ```bash
   export TYPESAFE_API_KEY=<your key>
   npm --prefix fish-career run build
   npm --prefix fish-career run record:eval
   ```

   This rewrites `fish-career/eval/base-run.json`. A weight-only change skips
   this step: the recorded answers still apply, and the composite is
   recomputed from them.

5. Read the new report, and decide whether the change is the one you meant:

   ```bash
   npm --prefix fish-career run build
   npm --prefix fish-career run quality
   ```

6. Record the new baseline in the three places the tests hold together:
   - `fish-career/eval/expected-metrics.json`: the values from
     `node fish-career/dist/index.js quality --json`.
   - The Proof section of `README.md` and the Recorded baseline section of
     `specs/quality.md`: the five published metrics, which
     `the published quality metrics` test checks against the golden file.

## Verification

```bash
npm --prefix fish-career run health
```

It prints no failures, and the diff shows the rubric, the golden metrics, and
the two published copies moving together.

## Troubleshooting

- **`applies the weights` fails.** A unit test in `rubric.test.ts` pins the
  relative order of weights it depends on; update it if the new order is
  intended.
- **`record:eval` refuses with `TYPESAFE_API_KEY is not set`.** Export the
  key, or put it in a `.env` at the repository root or in `fish-career/`.
  The script does not read `FISH_HOME`.
- **The test passes but rankings in your own cache look unchanged.** Run
  `fish triage`: every cached posting is stale under the new rubric and is
  scored again.

Related: [`specs/quality.md`](../../specs/quality.md) for the metrics,
[`fish-career/eval/README.md`](../../fish-career/eval/README.md) for the
dataset.
