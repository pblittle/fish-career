#!/usr/bin/env node
// triage.mjs is retired: the fish CLI owns scoring now. Kept as a shim so old
// habits keep working; FISH_HOME still defaults to this folder when unset.
//
//   node triage.mjs                    fish triage
//   node triage.mjs --rescore          fish triage --rescore
//   node triage.mjs --evaluate         fish evaluate
//   node triage.mjs --sample 12        fish calibrate start --count 12
//   node triage.mjs --reuse            fish calibrate reuse
//   node triage.mjs --explain acme     fish postings explain <postingId>
//   node triage.mjs --explain acme --dry-run   print the request, send nothing
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
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

process.env.FISH_HOME ??= HERE;
const { createApplicationFromHome } = await import(
  './fish-career/dist/bootstrap/create-application.js'
);
const { runCli } = await import('./fish-career/dist/interfaces/cli/cli.js');
const app = createApplicationFromHome();

let mapped;
if (args.includes('--evaluate')) {
  mapped = ['evaluate'];
} else if (args.includes('--explain')) {
  const needle = valueOf('--explain');
  if (!needle) {
    console.error('--explain needs a posting ID or a substring of one.');
    process.exit(1);
  }
  const lower = needle.toLowerCase();
  const matches = (await app.listPostings()).filter(
    (p) =>
      p.postingId.toLowerCase().includes(lower) ||
      `${p.company}: ${p.title}`.toLowerCase().includes(lower),
  );
  if (matches.length === 0) {
    console.error(`No posting matches "${needle}".`);
    process.exit(1);
  }
  mapped = [
    'postings',
    'explain',
    matches[0].postingId,
    ...(args.includes('--dry-run') ? ['--dry-run'] : []),
  ];
} else if (args.includes('--sample')) {
  mapped = ['calibrate', 'start', '--count', String(Number(valueOf('--sample')) || 12)];
} else if (args.includes('--reuse')) {
  mapped = ['calibrate', 'reuse'];
} else if (args.includes('--dry-run')) {
  console.error('--dry-run needs --explain: node triage.mjs --explain <needle> --dry-run');
  process.exit(1);
} else {
  mapped = ['triage', ...args];
}

process.exitCode = await runCli(mapped, { app });
