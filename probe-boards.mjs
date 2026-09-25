#!/usr/bin/env node
// probe-boards.mjs is retired: board verification is a product surface now.
//   node probe-boards.mjs <slug>       fish watchlist probe <slug>
//
// Requires the package built once: npm --prefix fish-career run build.

import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = `${HERE}/fish-career/dist/interfaces/cli/cli.js`;
if (!existsSync(ENGINE)) {
  console.error('fish-career is not built. Run: npm --prefix fish-career run build');
  process.exit(1);
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node probe-boards.mjs <slug>   (or: fish watchlist probe <slug>)');
  process.exit(1);
}

process.env.FISH_HOME ??= HERE;
const { createApplicationFromHome } = await import(
  './fish-career/dist/bootstrap/create-application.js'
);
const { runCli } = await import('./fish-career/dist/interfaces/cli/cli.js');
process.exitCode = await runCli(['watchlist', 'probe', slug], {
  app: createApplicationFromHome(),
});
