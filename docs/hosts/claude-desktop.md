# Claude Desktop

Claude Desktop reads MCP servers from `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add the server and point `FISH_HOME` at a directory that will hold your
profile, watchlist, postings, and state:

```json
{
  "mcpServers": {
    "fish-career": {
      "command": "node",
      "args": ["/absolute/path/to/fish-career/fish-career/dist/index.js"],
      "env": { "FISH_HOME": "/absolute/path/to/fish-state" }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the tools menu. Then follow the
five-minute setup in the [README](../README.md#five-minute-setup).

If you installed the package from npm instead of source, the same entry works
with `"command": "npx"` and `"args": ["-y", "fish-career"]`.

## Verifying the connection

Ask Claude to run `get_profile`. Before a profile exists it answers that there
is none at `$FISH_HOME/profile.md`; that is the server working. Then run
`update_profile` with your profile text.
