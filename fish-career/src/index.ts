#!/usr/bin/env node
// fish.career entry point. No arguments starts the MCP server over stdio,
// which is what hosts run; every other word is a CLI command over the same
// application. See interfaces/cli/cli.ts for the command list.

import { createApplicationFromHome } from './bootstrap/create-application.js';
import { createServerFromHome, packageVersion } from './bootstrap/create-server.js';
import { runCli, USAGE } from './interfaces/cli/cli.js';
import { runDemo } from './interfaces/cli/demo.js';
import { startStdioServer } from './interfaces/mcp/server.js';

const argv = process.argv.slice(2);
const command = argv[0];

if (command === 'demo') {
  await runDemo({ keep: argv.includes('--keep') });
} else if (command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (command === '--version' || command === '-v') {
  console.log(packageVersion());
} else if (command === undefined || command === 'mcp') {
  const server = createServerFromHome();
  await startStdioServer(server);
} else {
  const app = createApplicationFromHome();
  process.exitCode = await runCli(argv, { app });
}
