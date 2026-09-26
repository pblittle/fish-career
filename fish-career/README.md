# fish-career

A local-first MCP server that finds job opportunities, interprets their fit,
scores them with an explicit rubric, and hones that rubric against human
judgment.

This is the package README. The repository has the full story, the
architecture, and the specs: **<https://github.com/pblittle/fish-career>**

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

Once the first npm release lands, `npx -y fish-career` is the one-command path
for the demo and the server.

Then, from the host: write a profile, probe a company, add it to the
watchlist, fetch arrivals, triage them, and calibrate the rubric against your
own blind ranking. The repository README walks the whole setup.

## Tools

| Tool | Purpose |
|---|---|
| `watchlist_probe` | Probe the four public ATS boards for a company slug (read-only) |
| `watchlist_add` / `watchlist_remove` | Write or remove a verified watchlist entry |
| `fetch_postings` | Poll the watchlist and write new remote postings |
| `triage_postings` | Score postings against the profile, return a ranked table |
| `evaluate_ranking` | Hold the ranking to the preferences your profile states |
| `calibration_start` / `calibration_submit` / `calibration_rescore` | Blind human ranking vs the rubric |
| `profile_update` | Replace the candidate profile |

Passive state is exposed as resources: `fish://profile/current`,
`fish://watchlist`, `fish://postings`, `fish://postings/{postingId}`,
`fish://rubric/current`, `fish://calibrations/latest`, `fish://runs/latest`.
Workflow prompts ship too: `career-search-onboarding`,
`review-new-arrivals`, `explain-ranking`, `calibrate-rubric`, `audit-profile`.

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
posting text.

## License

MIT. See [LICENSE](./LICENSE).
