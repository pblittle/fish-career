# How to connect an MCP host

Register fish as a stdio MCP server in Claude Desktop, Cursor, or opencode,
so the host can call its tools and read its resources from chat.

## Prerequisites

- A built checkout: `npm ci --prefix fish-career && npm run build --prefix
  fish-career` from the repository root. fish is not on npm yet, so the host
  runs the built file.
- The absolute path to that checkout, and to the `FISH_HOME` you want the
  host to use ([configuration](../reference/configuration.md)).

## Steps

1. Open the host's MCP config file:

   | Host | File |
   |---|---|
   | Claude Desktop, macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
   | Claude Desktop, Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
   | Claude Desktop, Linux | `~/.config/Claude/claude_desktop_config.json` |
   | Cursor | `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project |
   | opencode | `~/.config/opencode/opencode.json`, or `opencode.json` in a project |

2. Add fish. Claude Desktop and Cursor:

   ```json
   {
     "mcpServers": {
       "fish-career": {
         "command": "node",
         "args": ["/absolute/path/to/repo/fish-career/dist/index.js"],
         "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
       }
     }
   }
   ```

   opencode:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "mcp": {
       "fish-career": {
         "type": "local",
         "command": ["node", "/absolute/path/to/repo/fish-career/dist/index.js"],
         "enabled": true,
         "environment": { "FISH_HOME": "/absolute/path/to/fish-state" }
       }
     }
   }
   ```

   `/absolute/path/to/repo` is the clone; `fish-career/` is the package
   inside it. Put the judge key in `FISH_HOME/.env`, not in this file
   ([How to configure the judge](./configure-the-judge.md)).

3. Restart the host.

## Verification

Ask the host to read the `fish://profile/current` resource. Before a profile
exists it answers `(no profile yet)`; that is the server working. Then ask it
to run the `career-search-onboarding` prompt, which walks the setup in order.

## Troubleshooting

- **The server never appears.** GUI apps often start with a shorter `PATH`
  than your shell, so `node` may not resolve. Use the absolute path from
  `which node` as the `command`.
- **It reads the wrong state.** Without `FISH_HOME` in the config, the server
  uses `~/.config/fish`. Set it explicitly.
- **Scoring tools return `NO_JUDGE`.** The server found no usable key. A
  secret reference such as `op://...` counts as no key unless the host
  launches fish through the tool that resolves it
  ([How to configure the judge](./configure-the-judge.md)).

## Optional: a web search companion

fish reads only the boards you watch. To find boards worth watching, give the
host a search server beside fish and let it hand posting URLs to
`watchlist_add`. Firecrawl's MCP server is one; it needs its own key from
<https://www.firecrawl.dev>:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/repo/fish-career/dist/index.js"],
      "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "fc-..." }
    }
  }
}
```

fish's own outbound calls do not change: it reads the URL offline and never
calls Firecrawl. The host's searches and the pages it scrapes go to Firecrawl
under Firecrawl's terms, so keep personal details out of what you ask it to
search.

Related: [MCP surface](../reference/mcp.md),
[How to drive fish from an agent](./drive-fish-from-an-agent.md).
