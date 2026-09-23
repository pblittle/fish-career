#!/usr/bin/env node
// Thin CLI over the fish-mcp fetch engine. The engine owns the dedupe
// semantics; this file only parses arguments and prints the diff.
//
//   node fetch.mjs                     poll the whole watchlist
//   node fetch.mjs --company zapier    one company (substring match)
//   node fetch.mjs --days 30           first-run window override
//   node fetch.mjs --all               ignore the first-run window
//
// Requires the package built once: npm --prefix fish-mcp run build.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAll } from './fish-mcp/dist/fetch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.FISH_HOME ?? HERE;
const ENGINE = join(HERE, 'fish-mcp', 'dist');
if (!existsSync(join(ENGINE, 'fetch.js'))) {
  console.error('fish-mcp is not built. Run: npm --prefix fish-mcp run build');
  process.exit(1);
}

const args = process.argv.slice(2);
const companyArg = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;
const daysArg = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 14;
const ignoreWindow = args.includes('--all');

const watchlist = JSON.parse(readFileSync(join(HOME, 'watchlist.json'), 'utf8')).companies;
const companies = companyArg
  ? watchlist.filter((c) => c.name.toLowerCase().includes(companyArg.toLowerCase()))
  : watchlist;
if (companies.length === 0) {
  console.error(`No watchlist company matches "${companyArg}".`);
  process.exit(1);
}

const seenPath = join(HOME, 'state', 'seen.json');
const firstRun = !existsSync(seenPath);
let seen = {};
if (!firstRun) {
  seen = JSON.parse(readFileSync(seenPath, 'utf8'));
}
const cutoff = firstRun && !ignoreWindow ? daysArg : null;

const outcome = await fetchAll(companies, {
  postingsDir: join(HOME, 'postings'),
  seen,
  days: cutoff,
});

if (Object.keys(outcome.newSeen).length > 0) {
  mkdirSync(join(HOME, 'state'), { recursive: true });
  writeFileSync(seenPath, JSON.stringify({ ...seen, ...outcome.newSeen }, null, 2));
}

for (const c of outcome.perCompany) {
  console.log(`${c.name}: ${c.total} postings, ${c.remote} remote, ${c.written} new`);
}
const totalRemote = outcome.perCompany.reduce((n, c) => n + c.remote, 0);
console.log(
  `\n${outcome.arrivals.length} new posting${outcome.arrivals.length === 1 ? '' : 's'} written to postings/ (${totalRemote} remote total across the watchlist).`,
);
if (firstRun) {
  console.log(
    `First run: only postings newer than ${daysArg} days were written. Rerun with --all for everything, or add more days with --days N.`,
  );
}
if (outcome.failures.length > 0) console.log(`Boards that failed: ${outcome.failures.join(', ')}`);
if (outcome.arrivals.length > 0) console.log('Rank them with: node triage.mjs');
