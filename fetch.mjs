#!/usr/bin/env node
// fetch.mjs is retired: the fish CLI owns fetching now. Kept as a shim so old
// habits keep working; FISH_HOME still defaults to this folder when unset.
//
//   node fetch.mjs                     fish fetch
//   node fetch.mjs --company zapier    fish fetch --company zapier
//   node fetch.mjs --days 30           fish fetch --days 30
//   node fetch.mjs --all               fish fetch --all
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

process.env.FISH_HOME ??= HERE;
const { createApplicationFromHome } = await import(
  './fish-career/dist/bootstrap/create-application.js'
);
const { runCli } = await import('./fish-career/dist/interfaces/cli/cli.js');
process.exitCode = await runCli(['fetch', ...process.argv.slice(2)], {
  app: createApplicationFromHome(),
});
