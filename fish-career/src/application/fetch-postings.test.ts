import { describe, expect, it, vi } from 'vitest';
import {
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memorySkipTitlesStore,
  memoryTraceReader,
  memoryTraceSink,
  memoryVerdictStore,
  memoryWatchlistStore,
} from '../adapters/fake/in-memory.js';
import { memoryProvider } from '../adapters/fake/providers.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import type { Posting } from '../domain/posting.js';
import type { CareerDependencies } from './dependencies.js';
import { fetchPostings, totalDrops } from './fetch-postings.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-27T12:00:00.000Z');

const posting = (key: string, over: Partial<Posting> = {}): Posting => ({
  key,
  title: `Role ${key}`,
  location: 'Remote (US)',
  workplace: 'Remote',
  remote: true,
  comp: '',
  url: `https://example.com/${key}`,
  date: new Date(NOW - DAY).toISOString(),
  text: 'x'.repeat(200),
  ...over,
});

interface Harness {
  deps: CareerDependencies;
  acme: Posting[];
  beta: Posting[];
  seen: ReturnType<typeof memorySeenStore>;
  provider: ReturnType<typeof memoryProvider>;
  clock: { now: () => Date; set: (iso: string) => void };
}

const harness = (): Harness => {
  const acme = [
    posting('fixture:acme:1'),
    posting('fixture:acme:2', { text: 'short' }),
    posting('fixture:acme:3', { date: new Date(NOW - 30 * DAY).toISOString() }),
    posting('fixture:acme:4', { remote: false }),
    posting('fixture:acme:5', { text: '' }),
  ];
  const beta = [posting('fixture:beta:1', { date: new Date(NOW - 30 * DAY).toISOString() })];
  const seen = memorySeenStore();
  let current = new Date(NOW);
  const clock = {
    now: () => current,
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
  const provider = memoryProvider('fixture', { acme, beta }, async (p) =>
    p.key.endsWith(':5') ? 'y'.repeat(200) : 'still short',
  );
  const traces = memoryTraceSink();
  const deps: CareerDependencies = {
    providers: { fixture: provider },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen,
    verdicts: memoryVerdictStore(),
    ledger: memoryLedger(),
    traces,
    traceReader: memoryTraceReader(traces.records),
    profile: memoryProfileStore('Remote US only.'),
    watchlist: memoryWatchlistStore([
      { name: 'Acme', provider: 'fixture', slug: 'acme' },
      { name: 'Beta', provider: 'fixture', slug: 'beta' },
    ]),
    preferences: memoryPreferencesStore(),
    calibrations: memoryCalibrationStore(),
    clock,
    random: { int: () => 0, shuffle: (xs) => [...xs] },
  };
  return { deps, acme, beta, seen, provider, clock };
};

describe('fetchPostings drop accounting', () => {
  it('counts every drop by reason, split out of the old collapsed baseline', async () => {
    const h = harness();
    const outcome = await fetchPostings(h.deps)({ companies: ['Acme'] });
    expect(outcome.perCompany).toEqual([
      {
        name: 'Acme',
        total: 5,
        remote: 4,
        written: 2,
        drops: { notRemote: 1, offTarget: 0, thinText: 1, outOfWindow: 1 },
      },
    ]);
    expect(outcome.arrivals.map((a) => a.postingId).sort()).toEqual(['acme-1', 'acme-5']);
  });

  it('writes observedAt when a posting is first marked seen, and preserves it', async () => {
    const h = harness();
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    const first = await h.seen.read();
    expect(first['fixture:acme:1']?.observedAt).toBe('2026-09-27T12:00:00.000Z');
    expect(first['fixture:acme:3']?.observedAt).toBe('2026-09-27T12:00:00.000Z');
    // A non-remote posting is never marked seen at all.
    expect(first['fixture:acme:4']).toBeUndefined();

    h.clock.set('2026-09-29T08:00:00.000Z');
    h.acme.push(posting('fixture:acme:6'));
    const second = await fetchPostings(h.deps)({ companies: ['Acme'] });
    expect(second.arrivals.map((a) => a.postingId)).toEqual(['acme-6']);
    const after = await h.seen.read();
    expect(after['fixture:acme:6']?.observedAt).toBe('2026-09-29T08:00:00.000Z');
    // The first observations are untouched by the later poll.
    expect(after['fixture:acme:1']?.observedAt).toBe('2026-09-27T12:00:00.000Z');
  });

  it('writes an old posting when a later poll carries no explicit window', async () => {
    const h = harness();
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    const later = await fetchPostings(h.deps)({ companies: ['Beta'] });
    // The default window is first-run only: without --days, an unseen old
    // posting is written, so the out-of-window bucket is degenerate here.
    expect(later.perCompany[0]?.drops.outOfWindow).toBe(0);
    expect(later.arrivals.map((a) => a.postingId)).toEqual(['beta-1']);
  });

  it('drops an out-of-window arrival on first contact when --days is explicit', async () => {
    const h = harness();
    const outcome = await fetchPostings(h.deps)({ companies: ['Beta'], days: 14 });
    expect(outcome.perCompany[0]).toEqual({
      name: 'Beta',
      total: 1,
      remote: 1,
      written: 0,
      drops: { notRemote: 0, offTarget: 0, thinText: 0, outOfWindow: 1 },
    });
    expect((await h.seen.read())['fixture:beta:1']?.observedAt).toBe('2026-09-27T12:00:00.000Z');
  });

  it('sums the drops over every board a poll read', async () => {
    const h = harness();
    // Only Beta's one title reads "Role fixture:beta:1".
    h.deps.skipTitles = memorySkipTitlesStore(['beta']);
    const outcome = await fetchPostings(h.deps)({});
    expect(totalDrops(outcome.perCompany)).toEqual({
      notRemote: 1,
      offTarget: 1,
      thinText: 1,
      outOfWindow: 1,
    });
  });

  it('records in the seen index why a posting it observed was not written', async () => {
    const h = harness();
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    const seen = await h.seen.read();
    expect(seen['fixture:acme:2']).toMatchObject({ observed: true, dropped: 'thin-text' });
    expect(seen['fixture:acme:3']).toMatchObject({ observed: true, dropped: 'out-of-window' });
    expect(seen['fixture:acme:1']).toMatchObject({ file: 'acme-1.txt' });
    expect(seen['fixture:acme:1']?.dropped).toBeUndefined();
  });
});

describe('fetchPostings skip titles', () => {
  const designer = (n: number, over: Partial<Posting> = {}): Posting =>
    posting(`fixture:acme:${n}`, { title: 'Product Designer II', ...over });

  it('sets aside a remote title on the skip list and never marks it seen', async () => {
    const h = harness();
    h.acme.push(designer(6), designer(7, { remote: false }));
    h.deps.skipTitles = memorySkipTitlesStore(['designer']);
    const outcome = await fetchPostings(h.deps)({ companies: ['Acme'] });
    // The remote check runs first: posting 7 is not remote, whatever its title.
    expect(outcome.perCompany[0]?.drops).toEqual({
      notRemote: 2,
      offTarget: 1,
      thinText: 1,
      outOfWindow: 1,
    });
    expect(outcome.arrivals.map((a) => a.postingId).sort()).toEqual(['acme-1', 'acme-5']);
    expect((await h.seen.read())['fixture:acme:6']).toBeUndefined();
  });

  it('writes the posting on the next poll once the phrase is deleted', async () => {
    const h = harness();
    h.acme.push(designer(6));
    const skip = memorySkipTitlesStore(['designer']);
    h.deps.skipTitles = skip;
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    skip.phrases = [];
    const second = await fetchPostings(h.deps)({ companies: ['Acme'] });
    expect(second.arrivals.map((a) => a.postingId)).toEqual(['acme-6']);
  });

  it('spends no detail fetch on a skipped title', async () => {
    const h = harness();
    h.acme.push(designer(6, { text: 'short' }));
    h.deps.skipTitles = memorySkipTitlesStore(['designer']);
    const detail = vi.spyOn(h.provider, 'detail');
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    expect(detail.mock.calls.map(([p]) => p.key).sort()).toEqual([
      'fixture:acme:2',
      'fixture:acme:5',
    ]);
  });

  it('leaves a posting already seen to admission, uncounted', async () => {
    const h = harness();
    await fetchPostings(h.deps)({ companies: ['Acme'] });
    // Every acme title reads "Role fixture:acme:N".
    h.deps.skipTitles = memorySkipTitlesStore(['role']);
    const second = await fetchPostings(h.deps)({ companies: ['Acme'] });
    expect(second.perCompany[0]?.drops.offTarget).toBe(0);
    expect(second.arrivals).toEqual([]);
  });
});
