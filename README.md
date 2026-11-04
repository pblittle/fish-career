# fish.career

[![test](https://github.com/pblittle/fish-career/actions/workflows/test.yml/badge.svg)](https://github.com/pblittle/fish-career/actions/workflows/test.yml)

fish.career is local-first job search: an MCP server and CLI that rank postings
against your profile, explain every score, and measure the ranking against your
own judgment.

The scarce resource is your attention. Job boards optimize for the opposite:
an unbounded feed, ranked by signals you cannot see and cannot argue with.
fish.career turns that stream into a small ranked table with the reasons
attached, and proves measurably that the ordering tracks your judgment rather
than a model's taste.

## Proof

The ranking is measured, not asserted. [`fish-career/eval/`](./fish-career/eval)
holds 17 labeled postings covering the hard cases, a recorded judge run, and
golden metrics: pairwise accuracy 92.3%, Kendall tau 73.7%, Spearman 86.3%,
precision@5 100%, nDCG@5 98.4%, with every blocked posting below every clean
one. `fish quality` reproduces the report offline. The findings, including
where the ranking still disagrees with the operator, are in
[`specs/quality.md`](./specs/quality.md).

[`examples/langgraph/`](./examples/langgraph) runs the same application API
(fetch, triage, a human-review interrupt, an optional re-measure) under
LangGraph. The ranking engine never imports it.

## Quickstart

Requires Node 20.12+. The package is not on npm yet, so install from source:

```bash
git clone https://github.com/pblittle/fish-career.git
cd fish-career
npm ci --prefix fish-career
npm run build --prefix fish-career
npm install -g ./fish-career
fish quality
```

`fish quality` prints the ranking-quality report offline, with no key and no
state. [Your first ranked table](./docs/tutorials/first-ranked-table.md)
continues from there through the whole loop on a real job board, with a
stand-in judge, in about fifteen minutes.

## Documentation

| Kind | Page |
|---|---|
| Tutorial | [Your first ranked table](./docs/tutorials/first-ranked-table.md) |
| How-to | [Connect an MCP host](./docs/how-to/connect-an-mcp-host.md) · [Configure the judge](./docs/how-to/configure-the-judge.md) · [Tune the ranking](./docs/how-to/tune-the-ranking.md) · [Find out why fish missed a posting](./docs/how-to/find-a-missed-posting.md) |
| How-to, for agents | [Drive fish from an agent](./docs/how-to/drive-fish-from-an-agent.md) |
| How-to, for developers | [Change the rubric](./docs/how-to/change-the-rubric.md) · [Add an MCP tool](./docs/how-to/add-an-mcp-tool.md) |
| Reference | [Command line](./docs/reference/cli.md) · [MCP surface](./docs/reference/mcp.md) · [Configuration and state](./docs/reference/configuration.md) |
| Explanation | [Architecture](./ARCHITECTURE.md) · [Privacy and data flow](./docs/explanation/privacy-and-data-flow.md) · [Product boundary (ADR 0001)](./docs/adr/0001-product-boundary.md) |
| Contracts | [The pipeline](./specs/pipeline.md) · [Ranking quality](./specs/quality.md) · [The MCP contract](./specs/mcp-contract.md) |

Working on fish itself, as a person or an agent: [`AGENTS.md`](./AGENTS.md)
holds the gate, the boundaries, and the commit rules.

## Known limits

- The package is not on npm yet. Until it is, install from source.
- The command is `fish`, which the fish shell also installs; with that shell,
  run `node fish-career/dist/index.js`. The default `FISH_HOME`,
  `~/.config/fish`, is also that shell's config directory, so set
  `FISH_HOME` explicitly.
- Greenhouse and SmartRecruiters boards carry no structured compensation.
  When a posting states a salary range in its body, the header carries that
  range verbatim; otherwise the comp dimension reads neutral, and a sub-floor
  posting can slip past the comp gate and should be eyeballed at the top of
  the table.
- US eligibility is not filtered at fetch; it lives in posting text and is
  judged by the location dimension and the blocker check.
- Ashby compensation ranges arrive as written by the employer, unverified.
- The judge's calibration on job postings is unknown until the first
  calibration run; treat early rankings as a measurement, not a verdict.
- One profile per `FISH_HOME`. No auto-applying, no authenticated scraping,
  no LinkedIn.

## License

MIT. See [LICENSE](./LICENSE).
