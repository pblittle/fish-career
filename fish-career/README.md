# fish-career

Local-first job search: an MCP server and CLI that rank postings against your
profile, explain every score, and measure the ranking against your own
judgment.

This is the package README. The repository has the architecture, the specs,
and the full walkthrough: **<https://github.com/pblittle/fish-career>**

## Quick start

Requires Node 20.12+. State lives in `FISH_HOME` (default `~/.config/fish`),
never in the package.

The package is not published to npm yet. From a source checkout, build once
and run the whole pipeline with no API key and no network:

```sh
npm ci --prefix fish-career
npm run build --prefix fish-career
node fish-career/dist/index.js demo
```

Connect an MCP host (Claude Desktop, opencode, Cursor) to the stdio server:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/repo/fish-career/dist/index.js"]
    }
  }
}
```

Once the first npm release lands, `npx -y fish-career` starts the stdio
server, and `npx -y fish-career demo` runs the demo.

Then, from the host: write a profile, probe a company, add it to the
watchlist, fetch arrivals, triage them, grade what you would act on, and
calibrate the rubric against your own blind ranking. The repository README
walks the whole setup and lists the CLI.

## What's in the package

Eleven MCP tools: `watchlist_probe`, `watchlist_add`, `watchlist_remove`,
`fetch_postings`, `verdict_record`, `triage_postings`, `evaluate_ranking`,
`calibration_start`, `calibration_submit`, `calibration_rescore`, and
`profile_update`. Passive state is exposed as resources, and the repeatable
workflows ship as prompts; the repository README lists them with the CLI.

Every tool returns structured content validated against a declared output
schema, plus text for chat hosts; expected failures carry a stable code.

Scoring requires a TypeSafe API key in `FISH_HOME/.env`; the demo and the
tests do not.

## State and privacy

Everything read and written hangs off `FISH_HOME`: profile, watchlist,
postings cache, `.env`, and run state. The package holds none of it. Postings
come from public, no-auth ATS APIs; the profile is sent to the judge on
scoring calls and nowhere else. An optional LangSmith trace mirror carries
hashes, the model, token counts, and typed answers, never the profile or
posting text. The repository README carries the details.

## License

MIT. See [LICENSE](./LICENSE).
