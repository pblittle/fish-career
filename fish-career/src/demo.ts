// The credential-free end-to-end run. It executes the real pipeline—fetch,
// triage, evaluate, calibrate—against bundled fixtures with a deterministic
// stand-in judge, so a new user can see the product work before writing a
// profile or getting an API key.
//
// Nothing here touches the user's real home: the run copies its fixtures
// into a temp directory, uses it as FISH_HOME for the duration, and removes
// it afterwards unless --keep was passed. No network is used; the fixture
// provider reads local files and the fake judge reads the state string.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCalibration, spearman } from './compare.js';
import type { WatchlistEntry } from './config.js';
import { type EvalOutcome, evaluatePreferences, type Preference, renderEval } from './evaluate.js';
import { fakeJudgeCall } from './fake-judge.js';
import { fetchAll } from './fetch.js';
import { collapseVariants, renderTable, type TriageRow } from './jev.js';
import type { Posting, Provider } from './providers.js';
import { scoreFiles } from './triage.js';

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

const field = (text: string, name: string): string =>
  text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim() ?? '';

// Fixture postings are stored in the same format fetch writes, so the demo
// exercises the real file format rather than a parallel one. The fixture
// provider reads the remote flag the way a real provider would: from the
// board's location field, not from hope.
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

export const runDemo = async (opts: DemoOptions = {}): Promise<DemoResult> => {
  const out = opts.out ?? ((line: string) => console.log(line));
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtures = join(here, '..', 'demo');
  const home = mkdtempSync(join(tmpdir(), 'fish-demo-'));
  const postingsDir = join(home, 'postings');
  const stateDir = join(home, 'state');
  mkdirSync(postingsDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  for (const name of ['profile.md', 'watchlist.json', 'preferences.json']) {
    copyFileSync(join(fixtures, name), join(home, name));
  }

  const boards = JSON.parse(readFileSync(join(fixtures, 'boards.json'), 'utf8')) as Record<
    string,
    string[]
  >;
  const provider: Provider = {
    async list(slug: string): Promise<Posting[]> {
      return (boards[slug] ?? []).map((stem) =>
        postingFromFile(
          join(fixtures, 'postings', `${slug}-${stem}.txt`),
          `fixture:${slug}:${stem}`,
        ),
      );
    },
  };
  const watchlist = (JSON.parse(readFileSync(join(home, 'watchlist.json'), 'utf8')).companies ??
    []) as WatchlistEntry[];
  const profile = readFileSync(join(home, 'profile.md'), 'utf8');

  out('fish.career demo — deterministic fixtures, no API key, no network.');
  out('The judge is a documented stand-in (src/fake-judge.ts), not a model.');
  out('');

  const fetched = await fetchAll(watchlist, {
    postingsDir,
    seen: {},
    days: null,
    providers: { fixture: provider },
  });
  out(`1. fetch — polled ${watchlist.length} fixture board${watchlist.length === 1 ? '' : 's'}`);
  for (const c of fetched.perCompany) {
    const skipped = c.total - c.remote;
    out(
      `   ${c.name}: ${c.total} postings, ${c.remote} remote, ${c.written} new` +
        (skipped > 0 ? ` (${skipped} non-remote skipped, as the real pipeline does)` : ''),
    );
  }
  out(`   ${fetched.arrivals.length} postings written to the cache.`);

  const files = fetched.arrivals.map((a) => a.file);
  const triaged = await scoreFiles(files, {
    profile,
    postingsDir,
    tracePath: join(stateDir, 'traces.jsonl'),
    judge: fakeJudgeCall,
  });
  out('');
  out('2. triage — scored every arrival against the demo profile');
  out(renderTable(collapseVariants(triaged.rows)));
  if (triaged.errors.length > 0) out(`   Failed: ${triaged.errors.join('; ')}`);

  const prefs = JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8')) as {
    preferences: Preference[];
  };
  const wanted = [...new Set(prefs.preferences.flatMap((p) => [p.better, p.worse]))].filter((f) =>
    files.includes(f),
  );
  const scored = await scoreFiles(wanted, { profile, postingsDir, judge: fakeJudgeCall });
  const evaluation = evaluatePreferences(scored.rows, prefs.preferences);
  out('');
  out("3. evaluate — the ranking held to the profile's stated preferences");
  out(renderEval(evaluation));

  const human = JSON.parse(readFileSync(join(fixtures, 'human-ranking.json'), 'utf8')) as string[];
  const slice = await scoreFiles(human, { profile, postingsDir, judge: fakeJudgeCall });
  const rho = spearman(
    human.map((_, i) => i),
    human.map((f) => slice.rows.findIndex((r) => r.file === f)),
  );
  out('');
  out('4. calibrate — a blind human ranking compared with the judge');
  out(renderCalibration(human, slice.rows, rho));

  out('');
  out(`Demo complete. State lived in ${home}${opts.keep ? '' : ' and was removed'}.`);
  if (!opts.keep) rmSync(home, { recursive: true, force: true });

  return {
    home,
    arrivals: fetched.arrivals.length,
    rows: triaged.rows,
    evaluation,
    rho,
  };
};
