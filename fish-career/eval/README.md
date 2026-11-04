# The evaluation dataset

This directory is the ranking-quality measurement: a labeled dataset, a
recorded judge run over it, and golden metrics. `fish quality` reads all
three and prints the report; `npm run smoke`, `npm test`, and CI never
re-record anything.

- `labels.json`: 17 synthetic postings graded 0-3 by the operator, each with
  a note saying why. Difficulty cases are deliberate: a board that says
  remote while the body says on-site, a hybrid role requiring relocation, a
  junior seat (overqualification), an APAC remote role, an ambiguous
  location, a missing-compensation posting, a duplicate regional listing, an
  adversarial posting with embedded scoring instructions, and a posting too
  thin to score.
- `profile.md`: the fixture profile the baseline run was judged against.
  Never a real operator's profile.
- `base-run.json`: one recorded judge run over the postings: the raw typed
  answers, latency, and token usage per posting, with the model, rubric
  version, and profile hash. Recorded with `npm run record:eval`, which
  spends real API credits.
- `expected-metrics.json`: the golden metrics for that baseline. A change
  that moves them must update this file deliberately; that is the regression
  contract.
- `postings/`: the posting fixtures, in the same header format the fetch
  engine writes.

## Changing the baseline

A rubric or dataset change that moves the metrics is landed through
[How to change the rubric](https://github.com/pblittle/fish-career/blob/main/docs/how-to/change-the-rubric.md):
re-record, read the report, and update `expected-metrics.json` with the two
published copies the tests hold it to.
