#!/usr/bin/env node
// triage.mjs is retired: the fish CLI owns scoring now. Kept as a shim so old
// habits keep working; FISH_HOME still defaults to this folder when unset.
//
//   node triage.mjs                    fish triage
//   node triage.mjs --rescore          fish triage --rescore
//   node triage.mjs --evaluate         fish evaluate
//   node triage.mjs --explain acme     fish postings read <postingId>
//   node triage.mjs --sample 12        fish calibrate start --count 12
//   node triage.mjs --reuse            (the recorded seed redraws a slice)
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

const args = process.argv.slice(2);
const mapped = args.includes('--evaluate')
  ? ['evaluate']
  : args.includes('--sample')
    ? ['calibrate', 'start', '--count', String(Number(args[args.indexOf('--sample') + 1]) || 12)]
    : ['triage', ...args];

process.env.FISH_HOME ??= HERE;
const { createApplicationFromHome } = await import(
  './fish-career/dist/bootstrap/create-application.js'
);
const { runCli } = await import('./fish-career/dist/interfaces/cli/cli.js');
process.exitCode = await runCli(mapped, { app: createApplicationFromHome() });
