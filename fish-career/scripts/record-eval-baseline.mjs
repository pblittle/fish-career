#!/usr/bin/env node
// Records a live judge run over the eval dataset into eval/base-run.json.
// Development-only: it spends API credits and writes into the package tree,
// so it is not part of the CLI or the published entry points. Run it after
// changing the dataset or the rubric, review the diff, and commit the result.
//
//   npm --prefix fish-career run record:eval
//
// The profile used is eval/profile.md (the public fixture), never the
// operator's own home.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JevJudge } from '../dist/adapters/judge/jev.js';
import { MIN_SCORABLE_TEXT, postingIdFromFile } from '../dist/domain/posting.js';
import { profileHash, RUBRIC_VERSION, stateFor } from '../dist/domain/rubric.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const evalDir = join(packageRoot, 'eval');
const postingsDir = join(evalDir, 'postings');

for (const candidate of [join(packageRoot, '..', '.env'), join(packageRoot, '.env')]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    // No .env there; the key may be in the environment.
  }
}
if (!process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY is not set; export it or put it in the repo .env.');
  process.exit(1);
}

const profile = readFileSync(join(evalDir, 'profile.md'), 'utf8');
const field = (text, name) => text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim() ?? '';
const judge = new JevJudge();

const entries = [];
const skipped = [];
for (const file of readdirSync(postingsDir)
  .filter((f) => f.endsWith('.txt'))
  .sort()) {
  const raw = readFileSync(join(postingsDir, file), 'utf8');
  const postingId = postingIdFromFile(file);
  if (raw.split('\n\n').slice(1).join('\n\n').trim().length < MIN_SCORABLE_TEXT) {
    skipped.push(postingId);
    console.log(`${postingId}: skipped (text below MIN_SCORABLE_TEXT)`);
    continue;
  }
  const title = field(raw, 'TITLE');
  const company = field(raw, 'COMPANY');
  const call = await judge.ask(stateFor(profile, raw));
  entries.push({
    postingId,
    file,
    title,
    company,
    answers: call.answers,
    latencyMs: call.latencyMs,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
  });
  console.log(
    `${postingId}: scored in ${call.latencyMs}ms (${call.inputTokens} in / ${call.outputTokens} out)`,
  );
}

writeFileSync(
  join(evalDir, 'base-run.json'),
  `${JSON.stringify(
    {
      about:
        'A recorded judge run over eval/postings, used as the deterministic baseline for the quality report. Re-record with npm run record:eval and review the diff.',
      capturedAt: new Date().toISOString(),
      model: 'jev-latest',
      rubric: RUBRIC_VERSION,
      profile: 'eval/profile.md',
      profileHash: profileHash(profile),
      skipped,
      entries,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${entries.length} entries to eval/base-run.json (${skipped.length} skipped)`);
