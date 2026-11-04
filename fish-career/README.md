# fish-career

Local-first job search: an MCP server and CLI that rank postings against your
profile, explain every score, and measure the ranking against your own
judgment.

This is the package README. The documentation lives in the repository:
**<https://github.com/pblittle/fish-career#documentation>**

## Quick start

Requires Node 20.12+. The package is not published to npm yet; build it from
a source checkout and follow
[Your first ranked table](https://github.com/pblittle/fish-career/blob/main/docs/tutorials/first-ranked-table.md),
which needs no API key. To run it under Claude Desktop, Cursor, or opencode:
[How to connect an MCP host](https://github.com/pblittle/fish-career/blob/main/docs/how-to/connect-an-mcp-host.md).

## What's in the package

`dist/` holds the stdio MCP server and the `fish` CLI, two surfaces over one
application core; `eval/` holds the labeled dataset, the recorded judge run,
and the golden metrics that `fish quality` reads. Every tool, resource,
prompt, and error code:
[the MCP surface](https://github.com/pblittle/fish-career/blob/main/docs/reference/mcp.md).
Every command:
[the command line](https://github.com/pblittle/fish-career/blob/main/docs/reference/cli.md).

## State and privacy

Everything fish reads and writes lives under `FISH_HOME` (default
`~/.config/fish`); the package holds none of it. Postings come from public,
no-auth ATS APIs, and the profile is sent to the judge on scoring calls and
nowhere else:
[Privacy and data flow](https://github.com/pblittle/fish-career/blob/main/docs/explanation/privacy-and-data-flow.md).

## License

MIT. See [LICENSE](./LICENSE).
