#!/usr/bin/env node
// Verifies the npm tarball contains what the product promises: the built
// server and CLI, the eval dataset, the package docs and license npm
// includes automatically, and nothing personal or test-only. Run by CI and
// available as `npm run verify:pack`.

import { execFileSync } from 'node:child_process';

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [pack] = JSON.parse(raw);
const files = pack.files.map((f) => f.path);

const requiredExact = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/interfaces/cli/cli.js',
  'dist/interfaces/mcp/server.js',
  'dist/adapters/judge/fake.js',
  'dist/bootstrap/create-application.js',
  'dist/bootstrap/create-server.js',
  'eval/README.md',
  'eval/labels.json',
  'eval/base-run.json',
  'eval/expected-metrics.json',
  'eval/profile.md',
];

const forbidden = [
  /^src\//,
  /\.test\./,
  /node_modules/,
  /tsconfig/,
  /^state\//,
  /^postings\//,
  /\.env$/,
  /verify-pack/,
];

const missing = requiredExact.filter((f) => !files.includes(f));
const leaked = files.filter((f) => forbidden.some((re) => re.test(f)));

if (missing.length > 0 || leaked.length > 0) {
  console.error('pack verification failed');
  for (const f of missing) console.error(`  missing: ${f}`);
  for (const f of leaked) console.error(`  leaked: ${f}`);
  process.exit(1);
}

console.log(`pack ok: ${files.length} files, ${Math.round(pack.unpackedSize / 1024)} KiB unpacked`);
