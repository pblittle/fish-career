# opencode

opencode reads MCP servers from `opencode.json` (project) or
`~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "fish-career": {
      "type": "local",
      "command": ["node", "/absolute/path/to/fish-career/fish-career/dist/index.js"],
      "enabled": true,
      "environment": { "FISH_HOME": "/absolute/path/to/fish-state" }
    }
  }
}
```

Restart opencode. The fish.career tools are available to the agent in any
session, and the agent can follow the workflow in the
[README](../README.md#quickstart).

From npm, the same entry works with `"command": ["npx", "-y", "fish-career"]`.
