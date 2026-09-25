# Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (project):

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

Reload the window, then use the tools from Cursor's agent. From npm, the same
entry works with `"command": "npx"` and `"args": ["-y", "fish-career"]`.

The agent can follow the workflow in the
[README](../README.md#five-minute-setup).
