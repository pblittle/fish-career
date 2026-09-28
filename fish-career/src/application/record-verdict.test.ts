import { describe, expect, it } from 'vitest';
import {
  fixedClock,
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memoryTraceReader,
  memoryTraceSink,
  memoryVerdictStore,
  memoryWatchlistStore,
} from '../adapters/fake/in-memory.js';
import { memoryProvider } from '../adapters/fake/providers.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import type { Posting } from '../domain/posting.js';
import { profileHash } from '../domain/rubric.js';
import { type CareerApplication, createApplication } from './career-application.js';
import type { CareerDependencies } from './dependencies.js';

const PROFILE = [
  'Remote US only; not open to relocation.',
  'Compensation floor: $180,000.',
  'Core skills: TypeScript, Node.js, Postgres, AWS, distributed systems.',
].join('\n');

const posting = (key: string, title: string): Posting => ({
  key,
  title,
  location: 'Remote (US)',
  workplace: 'Remote',
  remote: true,
  comp: '$200,000 – $240,000',
  url: `https://example.com/${key}`,
  date: '2026-09-20T00:00:00Z',
  text: `TypeScript, Node.js, Postgres, AWS. ${title}`.padEnd(120, ' '),
});

const board = (): Record<string, Posting[]> => ({
  acme: [
    posting('fixture:acme:1', 'Senior Backend Engineer'),
    posting('fixture:acme:2', 'Platform Engineer'),
  ],
});

interface Harness {
  app: CareerApplication;
  deps: CareerDependencies;
}

const harness = (over: Partial<CareerDependencies> = {}): Harness => {
  const traces = memoryTraceSink();
  const deps: CareerDependencies = {
    providers: { fixture: memoryProvider('fixture', board()) },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen: memorySeenStore(),
    verdicts: memoryVerdictStore(),
    ledger: memoryLedger(),
    traces,
    traceReader: memoryTraceReader(traces.records),
    profile: memoryProfileStore(PROFILE),
    watchlist: memoryWatchlistStore([{ name: 'Acme', provider: 'fixture', slug: 'acme' }]),
    preferences: memoryPreferencesStore(),
    calibrations: memoryCalibrationStore(),
    clock: fixedClock('2026-09-27T12:00:00.000Z'),
    random: { int: () => 0, shuffle: (xs) => [...xs] },
    ...over,
  };
  return { app: createApplication(deps), deps };
};

describe('recordVerdict', () => {
  it('records a verdict with provenance and the cache-wide counts', async () => {
    const h = harness();
    await h.app.fetchPostings();
    const result = await h.app.recordVerdict({ postingId: 'acme-1', label: 3 });
    expect(result.verdict).toEqual({
      postingId: 'acme-1',
      label: 3,
      profileHash: profileHash(PROFILE),
      rubric: 1,
      at: '2026-09-27T12:00:00.000Z',
    });
    expect(result.replaced).toBe(false);
    expect(result.graded).toBe(1);
    expect(result.pending).toBe(1);
    const stored = await h.deps.verdicts.read();
    expect(stored.verdicts['acme-1']?.label).toBe(3);
  });

  it('accepts a .txt suffix and is latest-wins for the posting', async () => {
    const h = harness();
    await h.app.fetchPostings();
    await h.app.recordVerdict({ postingId: 'acme-1', label: 3 });
    const regrade = await h.app.recordVerdict({ postingId: 'acme-1.txt', label: 1 });
    expect(regrade.verdict.postingId).toBe('acme-1');
    expect(regrade.replaced).toBe(true);
    expect(regrade.graded).toBe(1);
    expect(regrade.pending).toBe(1);
    const stored = await h.deps.verdicts.read();
    expect(Object.keys(stored.verdicts)).toEqual(['acme-1']);
    expect(stored.verdicts['acme-1']?.label).toBe(1);
  });

  it('refuses an unknown posting, an impossible label, and a corrupt store', async () => {
    const h = harness();
    await h.app.fetchPostings();
    await expect(h.app.recordVerdict({ postingId: 'nope', label: 2 })).rejects.toMatchObject({
      code: 'POSTING_NOT_FOUND',
    });
    await expect(h.app.recordVerdict({ postingId: 'acme-1', label: 7 })).rejects.toMatchObject({
      code: 'INVALID_GRADE',
    });

    let saved = 0;
    const corrupt = harness({
      verdicts: {
        read: async () => ({ ok: false, verdicts: {} }),
        save: async () => {
          saved += 1;
        },
      },
    });
    await corrupt.app.fetchPostings();
    await expect(
      corrupt.app.recordVerdict({ postingId: 'acme-1', label: 2 }),
    ).rejects.toMatchObject({ code: 'VERDICTS_UNREADABLE' });
    expect(saved).toBe(0);
  });
});

describe('listArrivals and verdictSummary', () => {
  it('lists ungraded arrivals and reports coverage and precision below the floor', async () => {
    const h = harness();
    await h.app.fetchPostings();
    const before = await h.app.listArrivals();
    expect(before.graded).toBe(0);
    expect(before.ungraded).toBe(2);
    expect(before.arrivals.map((a) => [a.postingId, a.label])).toEqual([
      ['acme-2', null],
      ['acme-1', null],
    ]);

    await h.app.recordVerdict({ postingId: 'acme-1', label: 2 });
    const after = await h.app.listArrivals();
    expect(after.graded).toBe(1);
    expect(after.ungraded).toBe(1);
    expect(after.arrivals.find((a) => a.postingId === 'acme-1')?.label).toBe(2);

    const summary = await h.app.verdictSummary();
    expect(summary.cached).toBe(2);
    expect(summary.graded).toBe(1);
    expect(summary.coverage).toBe(0.5);
    expect(summary.precision.n).toBe(1);
    expect(summary.precision.relevant).toBe(1);
    expect(summary.precision.belowFloor).toBe(true);
    expect(summary.precision.value).toBeNull();
    expect(summary.precision.wilson).toBeNull();
  });

  it('refuses to measure when the store is unreadable', async () => {
    const h = harness({
      verdicts: {
        read: async () => ({ ok: false, verdicts: {} }),
        save: async () => {},
      },
    });
    await h.app.fetchPostings();
    await expect(h.app.listArrivals()).rejects.toMatchObject({ code: 'VERDICTS_UNREADABLE' });
    await expect(h.app.verdictSummary()).rejects.toMatchObject({ code: 'VERDICTS_UNREADABLE' });
  });
});
