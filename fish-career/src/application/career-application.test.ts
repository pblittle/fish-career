import { describe, expect, it } from 'vitest';
import {
  fixedClock,
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memoryTraceSink,
  memoryWatchlistStore,
} from '../adapters/fake/in-memory.js';
import { memoryProvider } from '../adapters/fake/providers.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import type { Posting } from '../domain/posting.js';
import { type CareerApplication, createApplication } from './career-application.js';
import type { CareerDependencies } from './dependencies.js';

const PROFILE = [
  'Remote US only; not open to relocation.',
  'Compensation floor: $180,000.',
  'Core skills: TypeScript, Node.js, Postgres, AWS, distributed systems.',
  'Domains I want: developer tools, AI infrastructure.',
].join('\n');

const body = (extra = '') =>
  `TypeScript, Node.js, Postgres, AWS, and distributed systems. ${extra}`.padEnd(120, ' ');

const posting = (key: string, title: string, over: Partial<Posting> = {}): Posting => ({
  key,
  title,
  location: 'Remote (US)',
  workplace: 'Remote',
  remote: true,
  comp: '$200,000 – $240,000',
  url: `https://example.com/${key}`,
  date: '2026-09-20T00:00:00Z',
  text: body(),
  ...over,
});

const board = (): Record<string, Posting[]> => ({
  acme: [
    posting('fixture:acme:1', 'Senior Backend Engineer'),
    posting('fixture:acme:2', 'Junior Backend Engineer', {
      comp: '$110,000 – $130,000',
      text: body('Junior role.'),
    }),
  ],
  beta: [
    posting('fixture:beta:1', 'Platform Engineer', { text: body('Developer tooling.') }),
    posting('fixture:beta:2', 'Onsite Engineer', {
      location: 'Austin, TX',
      workplace: '',
      text: body('This role is on-site in Austin; there is no remote option.'),
    }),
  ],
});

interface Harness {
  app: CareerApplication;
  deps: CareerDependencies;
  ledger: ReturnType<typeof memoryLedger>;
  calibrations: ReturnType<typeof memoryCalibrationStore>;
}

const harness = (over: Partial<CareerDependencies> = {}): Harness => {
  const ledger = memoryLedger();
  const calibrations = memoryCalibrationStore();
  const deps: CareerDependencies = {
    providers: { fixture: memoryProvider('fixture', board()) },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen: memorySeenStore(),
    ledger,
    traces: memoryTraceSink(),
    profile: memoryProfileStore(PROFILE),
    watchlist: memoryWatchlistStore([
      { name: 'Acme', provider: 'fixture', slug: 'acme' },
      { name: 'Beta', provider: 'fixture', slug: 'beta' },
    ]),
    preferences: memoryPreferencesStore([
      {
        better: 'acme-1',
        worse: 'acme-2',
        source: 'fixture profile: compensation floor',
      },
    ]),
    calibrations,
    clock: fixedClock('2026-09-25T12:00:00.000Z'),
    random: { int: () => 0, shuffle: (xs) => [...xs] },
    ...over,
  };
  return { app: createApplication(deps), deps, ledger, calibrations };
};

const fetchAndRank = async (h: Harness) => {
  const fetched = await h.app.fetchPostings();
  const ranked = await h.app.rankPostings();
  return { fetched, ranked };
};

describe('the complete workflow over in-memory ports', () => {
  it('fetches arrivals, scores them, and leaves the cache and ledger consistent', async () => {
    const h = harness();
    const { fetched, ranked } = await fetchAndRank(h);
    expect(fetched.arrivals).toHaveLength(4);
    expect(ranked.rows).toHaveLength(4);
    expect(ranked.scored.sort()).toEqual(['acme-1', 'acme-2', 'beta-1', 'beta-2']);
    expect((await h.ledger.read()).entries['acme-1']?.rubric).toBe(1);
    // A second run has nothing new to score.
    await expect(h.app.rankPostings()).rejects.toMatchObject({ code: 'NOTHING_TO_SCORE' });
    // A rescore does it again.
    const rescored = await h.app.rankPostings({ rescore: true });
    expect(rescored.rows).toHaveLength(4);
  });

  it('delivers arrivals only: a second poll returns nothing new', async () => {
    const h = harness();
    await h.app.fetchPostings();
    const second = await h.app.fetchPostings();
    expect(second.arrivals).toEqual([]);
    expect(second.firstRun).toBe(false);
  });

  it('scores an explicit slice without marking the ledger', async () => {
    const h = harness();
    await h.app.fetchPostings();
    const ranked = await h.app.rankPostings({ postingIds: ['acme-1', 'acme-2'] });
    expect(ranked.rows).toHaveLength(2);
    expect((await h.ledger.read()).entries).toEqual({});
  });

  it('holds the ranking to the stated preferences', async () => {
    const h = harness();
    await fetchAndRank(h);
    const { evaluation } = await h.app.evaluateRanking();
    expect(evaluation).toMatchObject({ satisfied: 1, total: 1, violations: [] });
  });

  it('draws a reproducible calibration slice and measures agreement', async () => {
    const h = harness();
    await fetchAndRank(h);
    const first = await h.app.startCalibration({ count: 3, seed: 1234 });
    const second = await h.app.startCalibration({ count: 3, seed: 1234 });
    expect(second.postingIds).toEqual(first.postingIds);
    expect(first.postingIds).toHaveLength(3);

    const scored = await h.app.rankPostings({ postingIds: first.postingIds });
    const human = scored.rows.map((r) => r.postingId);
    const { record } = await h.app.submitCalibration({ ranking: human });
    expect(record.rho).toBe(1);
    expect(h.calibrations.records).toHaveLength(1);

    const rescored = await h.app.rescoreCalibration();
    expect(rescored.record.rho).toBe(1);
    expect(rescored.previousRho).toBe(1);
    expect(h.calibrations.records).toHaveLength(2);
  });

  it('refuses an incomplete human ranking', async () => {
    const h = harness();
    await fetchAndRank(h);
    const { postingIds } = await h.app.startCalibration({ count: 3, seed: 9 });
    await expect(
      h.app.submitCalibration({ ranking: postingIds.slice(0, 1) }),
    ).rejects.toMatchObject({ code: 'INVALID_RANKING' });
  });

  it('a human order that disagrees with the judge produces a negative rho', async () => {
    const h = harness();
    await fetchAndRank(h);
    const { postingIds } = await h.app.startCalibration({ count: 3, seed: 3 });
    const judgeOrder = (await h.app.rankPostings({ postingIds })).rows.map((r) => r.postingId);
    const { record } = await h.app.submitCalibration({ ranking: [...judgeOrder].reverse() });
    expect(record.rho).toBe(-1);
    // The record keeps the judge's ranked rows whatever the human order was.
    expect(record.rows.map((r) => r.postingId)).toEqual(judgeOrder);
  });

  it('excludes a posting that failed to score from the correlation, and says so', async () => {
    const judge = {
      ask: async (state: string) => {
        if (state.includes('Junior Backend Engineer')) throw new Error('judge exploded');
        return fakeJudge.ask(state);
      },
    };
    const h = harness({ judge });
    await h.app.fetchPostings();
    const started = await h.app.startCalibration({ count: 4, seed: 1 });
    expect(started.postingIds).toHaveLength(4);
    const { record, errors } = await h.app.submitCalibration({ ranking: started.postingIds });
    expect(record.rows).toHaveLength(3);
    expect(record.humanRanking).toHaveLength(3);
    expect(errors.some((e) => e.includes('excluded from the correlation'))).toBe(true);
  });

  it('traces a failed explain call instead of leaving it invisible', async () => {
    const traces = memoryTraceSink();
    const judge = {
      ask: async () => {
        throw new Error('judge exploded');
      },
    };
    const h = harness({ judge, traces });
    await h.app.fetchPostings();
    await expect(h.app.explainPosting({ postingId: 'acme-1' })).rejects.toThrow('judge exploded');
    expect(traces.records).toHaveLength(1);
    expect(traces.records[0]).toMatchObject({ postingId: 'acme-1', status: 'error' });
  });

  it('probes, adds, and removes companies through the watchlist port', async () => {
    const h = harness();
    const probe = await h.app.probeCompany({ slug: 'acme' });
    expect(probe.counts).toEqual({ fixture: 2 });
    expect(probe.samples[0]?.titles).toEqual([
      'Senior Backend Engineer',
      'Junior Backend Engineer',
    ]);

    const added = await h.app.addCompany({ name: 'Gamma', provider: 'fixture', slug: 'gamma' });
    expect(added.added).toBe(true);
    const again = await h.app.addCompany({ name: 'gamma', provider: 'fixture', slug: 'gamma' });
    expect(again.added).toBe(false);
    await expect(
      h.app.addCompany({ name: 'Nope', provider: 'workday', slug: 'nope' }),
    ).rejects.toMatchObject({ code: 'INVALID_COMPANY' });

    expect((await h.app.listWatchlist()).map((e) => e.name)).toContain('Gamma');
    const removed = await h.app.removeCompany({ name: 'Gamma' });
    expect(removed.removed).toBe(true);
    expect((await h.app.listWatchlist()).map((e) => e.name)).not.toContain('Gamma');
  });

  it('reads a posting by stable ID and reports a miss with a code', async () => {
    const h = harness();
    await h.app.fetchPostings();
    const record = await h.app.readPosting({ postingId: 'acme-1' });
    expect(record.company).toBe('Acme');
    await expect(h.app.readPosting({ postingId: 'nope' })).rejects.toMatchObject({
      code: 'POSTING_NOT_FOUND',
    });
  });

  it('explains one posting with the raw answers and a trace', async () => {
    const traces = memoryTraceSink();
    const h = harness({ traces });
    await h.app.fetchPostings();
    const explanation = await h.app.explainPosting({ postingId: 'acme-1' });
    expect(explanation.model).toBe('fake-judge');
    expect(explanation.answers.hard_blocker.noul).toBeDefined();
    expect(explanation.row.postingId).toBe('acme-1');
    expect(traces.records).toHaveLength(1);
    expect(traces.records[0]).toMatchObject({ postingId: 'acme-1', status: 'ok' });

    const preview = await h.app.previewPosting({ postingId: 'acme-1' });
    expect(preview.state).toContain('JOB POSTING:');
    expect(preview.questions.hard_blocker).toBeDefined();
  });

  it('reports the pending calibration so a slice can be redrawn', async () => {
    const h = harness();
    await fetchAndRank(h);
    expect(await h.app.pendingCalibration()).toBeNull();
    const started = await h.app.startCalibration({ count: 2, seed: 5 });
    const pending = await h.app.pendingCalibration();
    expect(pending?.seed).toBe(5);
    expect(pending?.postingIds).toEqual(started.postingIds);
  });

  it('refuses to score without a profile, and to triage without a judge', async () => {
    const noProfile = harness({ profile: memoryProfileStore('') });
    await noProfile.app.fetchPostings();
    await expect(noProfile.app.rankPostings()).rejects.toMatchObject({ code: 'NO_PROFILE' });

    const noJudge = harness({ judge: null });
    await noJudge.app.fetchPostings();
    await expect(noJudge.app.rankPostings()).rejects.toMatchObject({ code: 'NO_JUDGE' });
  });
});
