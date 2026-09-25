# fish-career

A local-first MCP server that finds job opportunities, interprets their fit,
scores them with an explicit rubric, and hones that rubric against human
judgment.

This is the published package. The repository has the full story, the
architecture, and the specs: **<https://github.com/pblittle/fish-career>**

## Quick start

Requires Node 20.12+. State lives in `FISH_HOME` (default `~/.config/fish`),
never in the package.

Try the whole pipeline with no API key and no network:

```sh
npx -y fish-career demo
```

Connect an MCP host (Claude Desktop, opencode, Cursor) to the stdio server:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "npx",
      "args": ["-y", "fish-career"]
    }
  }
}
```

Then, from the host: write a profile, probe a company, add it to the
watchlist, fetch arrivals, triage them, and calibrate the rubric against your
own blind ranking. The repository README walks the whole five-minute setup.

## Tools

| Tool | Purpose |
|---|---|
| `watchlist_add` | Probe a company's ATS boards and add a verified entry |
| `watchlist_list` | List the watchlist |
| `fetch_postings` | Poll the watchlist and write new remote postings |
| `triage` | Score postings against the profile, return a ranked table |
| `evaluate` | Hold the ranking to the preferences your profile states |
| `calibrate_start` / `calibrate_submit` / `calibrate_rescore` | Blind human ranking vs the rubric |
| `get_profile` / `update_profile` | Read and replace the candidate profile |
| `read_posting` | Read one cached posting in full |

Scoring requires a TypeSafe API key in `FISH_HOME/.env`; the demo and the
tests do not.

## State and privacy

Everything read and written hangs off `FISH_HOME`: profile, watchlist,
postings cache, `.env`, and run state. The package holds none of it. Postings
come from public, no-auth ATS APIs; the profile is sent to the judge on
scoring calls and nowhere else.

## License

MIT. See [LICENSE](./LICENSE).
