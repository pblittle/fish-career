#!/usr/bin/env node
// Thin CLI over the fish-career scoring engine. The rubric, the Jev call, the
// table, and the scored ledger live in the package; this file owns the
// CLI-only concerns: argument parsing, the --sample/--reuse slice, and
// --explain. State directory is FISH_HOME, or this folder when unset.
//
//   node triage.mjs                    score new postings (ledger-aware)
//   node triage.mjs --sample 12        score a random slice, never marks
//   node triage.mjs --reuse            rescore the SAME slice
//   node triage.mjs --rescore          score everything again
//   node triage.mjs --evaluate         hold the rubric to preferences.json
//   node triage.mjs --explain acme     full answers for one posting
//   node triage.mjs --dry-run          print the request, call nothing
//
// Requires the package built once: npm --prefix fish-career run build.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePreferences, renderEval } from './fish-career/dist/evaluate.js';
import {
  BLOCKER_INSTRUCTIONS,
  callJev,
  collapseVariants,
  DIMENSIONS,
  profileHash,
  RUBRIC_VERSION,
  renderTable,
  stateFor,
} from './fish-career/dist/jev.js';
import { markScored, readLedger, stale, unscored } from './fish-career/dist/ledger.js';
import { scoreFiles } from './fish-career/dist/triage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.FISH_HOME ?? HERE;
try {
  process.loadEnvFile(join(HOME, '.env'));
} catch {
  // Key may be in the environment.
}

const args = process.argv.slice(2);
const explain = args.indexOf('--explain');
const dryRun = args.includes('--dry-run');
const explainNeedle = explain >= 0 ? args[explain + 1] : null;

const postingsDir = join(HOME, 'postings');
let files = readdirSync(postingsDir)
  .filter((f) => f.endsWith('.txt') || f.endsWith('.md'))
  .sort();
if (files.length === 0) {
  console.error('postings/ is empty. Run node fetch.mjs first.');
  process.exit(1);
}

const sampleIdx = args.indexOf('--sample');
const reuse = args.includes('--reuse');
if (reuse && explainNeedle === null) {
  try {
    files = JSON.parse(readFileSync(join(HOME, 'state', 'last-sample.json'), 'utf8')).filter((f) =>
      existsSync(join(postingsDir, f)),
    );
    console.log(`\nReusing the saved sample of ${files.length} postings.`);
  } catch {
    console.error('No saved sample to reuse. Run --sample N first.');
    process.exit(1);
  }
} else if (sampleIdx >= 0 && explainNeedle === null) {
  const n = Math.min(Number(args[sampleIdx + 1]) || 12, files.length);
  files = [...files].sort(() => Math.random() - 0.5).slice(0, n);
  mkdirSync(join(HOME, 'state'), { recursive: true });
  writeFileSync(join(HOME, 'state', 'last-sample.json'), JSON.stringify(files, null, 2));
  console.log(`Calibrating on a random ${files.length} of the postings in postings/.\n`);
}

// --evaluate: score the postings preferences.json names and hold the rubric
// to the pairs the profile already states. Never marks the ledger: it is a
// measurement, not a run.
if (args.includes('--evaluate') && explainNeedle === null) {
  let prefs;
  try {
    prefs = JSON.parse(readFileSync(join(HOME, 'preferences.json'), 'utf8'));
  } catch {
    console.error(
      `No preferences.json in ${HOME}. Name the pairs the rubric must respect, each with the profile line it came from.`,
    );
    process.exit(1);
  }
  const wanted = [...new Set(prefs.preferences.flatMap((p) => [p.better, p.worse]))].filter((f) =>
    existsSync(join(postingsDir, f)),
  );
  if (wanted.length === 0) {
    console.error('None of the postings named in preferences.json are in the cache.');
    process.exit(1);
  }
  const { rows, errors } = await scoreFiles(wanted, {
    profile: readFileSync(join(HOME, 'profile.md'), 'utf8'),
    postingsDir,
    tracePath: join(HOME, 'state', 'traces.jsonl'),
  });
  console.log(renderEval(evaluatePreferences(rows, prefs.preferences)));
  if (errors.length > 0) console.log(`Failed: ${errors.join('; ')}`);
  process.exit(0);
}

if (dryRun) {
  const profile = readFileSync(join(HOME, 'profile.md'), 'utf8');
  const questions = Object.fromEntries([
    ['hard_blocker', { type: 'noul', instructions: BLOCKER_INSTRUCTIONS }],
    ...DIMENSIONS.map((d) => [
      d.id,
      { type: 'score', instructions: d.instructions, criteria: d.criteria },
    ]),
  ]);
  console.log(`Dry run: the request for ${files[0]}, not sent.\n`);
  console.log(
    JSON.stringify(
      {
        state: stateFor(profile, readFileSync(join(postingsDir, files[0]), 'utf8')),
        model: 'jev-latest',
        questions,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (explainNeedle !== null) {
  files = files.filter((f) => f.toLowerCase().includes(explainNeedle.toLowerCase()));
  if (files.length === 0) {
    console.error(`No posting file matches "${explainNeedle}".`);
    process.exit(1);
  }
}

if (!process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY is not set. Get one at https://console.typesafe.ai/keys');
  process.exit(1);
}

const profile = readFileSync(join(HOME, 'profile.md'), 'utf8');

// Full runs score only postings never scored before under the current
// profile and rubric; calibration runs (--sample, --reuse) deliberately
// skip the ledger and never mark.
const rescore = args.includes('--rescore');
const scoredPath = join(HOME, 'state', 'scored.json');
const calibrating = sampleIdx >= 0 || reuse;
const provenance = { profileHash: profileHash(profile), rubric: RUBRIC_VERSION };
if (!calibrating) {
  const ledger = readLedger(scoredPath);
  if (!ledger.ok) {
    console.log(
      `WARNING: scored ledger at ${scoredPath} could not be read; treating it as empty.\n`,
    );
  }
  const staleNow = stale(files, ledger.entries, provenance);
  const before = files.length;
  if (!rescore) files = unscored(files, ledger.entries, provenance);
  if (files.length === 0) {
    console.log('Every posting in postings/ has already been scored. Use --rescore to redo them.');
    process.exit(0);
  }
  if (staleNow.length > 0 && !rescore) {
    console.log(
      `Re-scoring ${staleNow.length} postings whose scores predate the current profile or rubric.`,
    );
  }
  if (before !== files.length) {
    console.log(
      `Skipping ${before - files.length - staleNow.length} already-scored postings from earlier runs.\n`,
    );
  }
}

const startedAt = Date.now();

// scoreFiles does the loop; --explain needs the raw answers, so when it is
// active this CLI re-asks the single file itself for the full payload.
const toScore = explainNeedle !== null ? files.slice(0, 1) : files;
const marking = !calibrating && explainNeedle === null;
const { rows, errors } = await scoreFiles(toScore, {
  profile,
  postingsDir,
  tracePath: join(HOME, 'state', 'traces.jsonl'),
  ...(marking
    ? { checkpoint: (file, score) => markScored(scoredPath, { [file]: score }, provenance) }
    : {}),
});

if (explainNeedle !== null) {
  const body = readFileSync(join(postingsDir, toScore[0]), 'utf8');
  const call = await callJev(stateFor(profile, body));
  console.log('\nFull answers for the matched posting:');
  console.log(JSON.stringify(call.answers, null, 2));
  console.log(
    `\ncost: ${call.inputTokens} in / ${call.outputTokens} out tokens, ${call.latencyMs}ms`,
  );
}

if (explainNeedle === null) {
  console.log(`\n${renderTable(collapseVariants(rows))}`);
  console.log(`\n${rows.length} postings scored in ${Date.now() - startedAt}ms.`);
}
if (errors.length > 0) console.log(`Failed: ${errors.join('; ')}`);
