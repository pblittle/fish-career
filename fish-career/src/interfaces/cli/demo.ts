// The credential-free end-to-end run. It executes the real application over
// bundled fixtures: real filesystem adapters in a temp FISH_HOME, a fixture
// provider, and a deterministic stand-in judge, so a new user can see the
// product work before writing a profile or getting an API key.
//
// Nothing here touches the user's real home: the run copies its fixtures into
// a temp directory, uses it as FISH_HOME for the duration, and removes it
// afterwards unless --keep was passed. No network is used.

import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryProvider } from '../../adapters/fake/providers.js';
import { fakeJudge } from '../../adapters/judge/fake.js';
import { createApplicationFromHome } from '../../bootstrap/create-application.js';
import type { TriageRow } from '../../domain/answers.js';
import { renderCalibration } from '../../domain/calibration.js';
import { type Posting, type PostingId, postingIdFromFile } from '../../domain/posting.js';
import type { EvalOutcome } from '../../domain/preferences.js';
import { renderEval } from '../../domain/preferences.js';
import { collapseVariants, renderTable } from '../../domain/ranking.js';

export interface DemoOptions {
  out?: (line: string) => void;
  keep?: boolean;
}

export interface DemoResult {
  home: string;
  arrivals: number;
  rows: TriageRow[];
  evaluation: EvalOutcome;
  rho: number | null;
}

const DEMO_SEED = 20260925;

const field = (text: string, name: string): string =>
  text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim() ?? '';

// Fixture postings are stored in the same format fetch writes, so the demo
// exercises the real file format rather than a parallel one. The fixture
// provider reports the board's remote flag, as a real provider would.
const postingFromFile = (path: string, key: string): Posting => {
  const raw = readFileSync(path, 'utf8');
  const location = field(raw, 'LOCATION');
  const remote = /\(remote\)/i.test(location);
  return {
    key,
    title: field(raw, 'TITLE'),
    location,
    workplace: remote ? 'Remote' : /hybrid/i.test(location) ? 'Hybrid' : '',
    remote,
    comp: field(raw, 'COMPENSATION'),
    url: field(raw, 'URL'),
    date: field(raw, 'PUBLISHED'),
    text: raw.split('\n\n').slice(1).join('\n\n').trim(),
  };
};

const fixtureBoards = (
  fixtures: string,
  boards: Record<string, string[]>,
): Record<string, Posting[]> => {
  const out: Record<string, Posting[]> = {};
  for (const [slug, stems] of Object.entries(boards)) {
    out[slug] = stems.map((stem) =>
      postingFromFile(join(fixtures, 'postings', `${slug}-${stem}.txt`), `fixture:${slug}:${stem}`),
    );
  }
  return out;
};

export const runDemo = async (opts: DemoOptions = {}): Promise<DemoResult> => {
  const out = opts.out ?? ((line: string) => console.log(line));
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtures = join(here, '..', '..', '..', 'demo');
  const home = mkdtempSync(join(tmpdir(), 'fish-demo-'));
  for (const name of ['profile.md', 'watchlist.json', 'preferences.json']) {
    copyFileSync(join(fixtures, name), join(home, name));
  }

  const boards = JSON.parse(readFileSync(join(fixtures, 'boards.json'), 'utf8')) as Record<
    string,
    string[]
  >;
  const provider = memoryProvider('fixture', fixtureBoards(fixtures, boards));
  const app = createApplicationFromHome({
    home,
    judge: fakeJudge,
    providers: { fixture: provider },
    loadDotEnv: false,
  });

  out('fish.career demo: deterministic fixtures, no API key, no network.');
  out('The judge is a documented stand-in (src/adapters/judge/fake.ts), not a model.');
  out('');

  const fetched = await app.fetchPostings();
  out('1. fetch: polled 1 fixture board');
  for (const c of fetched.perCompany) {
    const skipped = c.total - c.remote;
    out(
      `   ${c.name}: ${c.total} postings, ${c.remote} remote, ${c.written} new` +
        (skipped > 0 ? ` (${skipped} non-remote skipped, as the real pipeline does)` : ''),
    );
  }
  out(`   ${fetched.arrivals.length} postings written to the cache.`);

  const ranked = await app.rankPostings();
  out('');
  out('2. triage: scored every arrival against the demo profile');
  out(renderTable(collapseVariants(ranked.rows)));
  if (ranked.errors.length > 0) out(`   Failed: ${ranked.errors.join('; ')}`);

  const evaluated = await app.evaluateRanking();
  out('');
  out("3. evaluate: the ranking held to the profile's stated preferences");
  out(renderEval(evaluated.evaluation));

  const fixtureRanking = (
    JSON.parse(readFileSync(join(fixtures, 'human-ranking.json'), 'utf8')) as string[]
  ).map(postingIdFromFile);
  const started = await app.startCalibration({ count: 3, seed: DEMO_SEED });
  const human: PostingId[] = fixtureRanking.filter((id) => started.postingIds.includes(id));
  for (const id of started.postingIds) if (!human.includes(id)) human.push(id);
  const calibrated = await app.submitCalibration({ ranking: human });
  out('');
  out('4. calibrate: a blind human ranking compared with the judge');
  out(
    renderCalibration(
      calibrated.record.humanRanking,
      calibrated.record.rows,
      calibrated.record.rho,
    ),
  );

  out('');
  out(`Demo complete. State lived in ${home}${opts.keep ? '' : ' and was removed'}.`);
  if (!opts.keep) rmSync(home, { recursive: true, force: true });

  return {
    home,
    arrivals: fetched.arrivals.length,
    rows: ranked.rows,
    evaluation: evaluated.evaluation,
    rho: calibrated.record.rho,
  };
};
