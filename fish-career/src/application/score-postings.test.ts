import { describe, expect, it } from 'vitest';
import {
  fixedClock,
  memoryLedger,
  memoryPostingRepository,
  memoryTraceReader,
  memoryTraceSink,
} from '../adapters/fake/in-memory.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import type { PostingRecord } from '../domain/posting.js';
import type { CareerDependencies } from './dependencies.js';
import { scorePostings } from './score-postings.js';

const record = (id: string, title = `Role ${id}`): PostingRecord => ({
  id,
  file: `${id}.txt`,
  title,
  company: 'Acme',
  location: 'Remote',
  compensation: '',
  url: `https://example.com/${id}`,
  published: '2026-09-01T00:00:00Z',
  text: `TITLE: ${title}\nCOMPANY: Acme\nLOCATION: Remote (Remote)\n\n${'TypeScript, Node.js, Postgres, AWS, distributed systems. '.repeat(3)}`,
});

const deps = (over: Partial<CareerDependencies> = {}): CareerDependencies => ({
  providers: {},
  judge: fakeJudge,
  postings: memoryPostingRepository(),
  seen: { read: async () => ({}), write: async () => {} },
  ledger: memoryLedger(),
  traces: memoryTraceSink(),
  traceReader: memoryTraceReader(),
  profile: { read: async () => '', write: async () => {} },
  watchlist: { read: async () => [], write: async () => {} },
  preferences: { read: async () => [] },
  calibrations: {
    save: async () => {},
    latest: async () => null,
    savePending: async () => {},
    readPending: async () => null,
  },
  clock: fixedClock('2026-09-25T12:00:00.000Z'),
  random: { int: () => 0, shuffle: (xs) => [...xs] },
  ...over,
});

const PROFILE = [
  'Remote US only.',
  'Compensation floor: $180,000.',
  'Core skills: TypeScript, Node.js, Postgres, AWS, distributed systems.',
  'Domains I want: developer tools, AI infrastructure.',
].join('\n');

describe('scorePostings', () => {
  it('scores every record, marks the ledger when asked, and traces each call', async () => {
    const ledger = memoryLedger();
    const traces = memoryTraceSink();
    const result = await scorePostings(deps({ ledger, traces }))([record('a'), record('b')], {
      profile: PROFILE,
      markLedger: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.postingId)).toEqual(['a', 'b']);
    expect((await ledger.read()).entries.a?.score).toBeGreaterThan(0);
    expect(traces.records).toHaveLength(2);
    expect(traces.records[0]).toMatchObject({
      postingId: 'a',
      status: 'ok',
      model: 'fake-judge',
      rubric: 1,
    });
    expect(traces.records[0]?.at).toBe('2026-09-25T12:00:00.000Z');
  });

  it('does not mark the ledger when the run is a measurement', async () => {
    const ledger = memoryLedger();
    await scorePostings(deps({ ledger }))([record('a')], { profile: PROFILE });
    expect((await ledger.read()).entries).toEqual({});
  });

  it('fails one posting without stopping the run, and traces the error', async () => {
    const traces = memoryTraceSink();
    const judge = {
      ask: async (state: string) => {
        if (state.includes('Role b')) throw new Error('judge exploded');
        return fakeJudge.ask(state);
      },
    };
    const result = await scorePostings(deps({ judge, traces }))([record('a'), record('b')], {
      profile: PROFILE,
    });
    expect(result.rows.map((r) => r.postingId)).toEqual(['a']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^b: /);
    expect(traces.records.map((t) => t.status)).toEqual(['ok', 'error']);
  });

  it('refuses to run without a judge, with a stable code', async () => {
    await expect(
      scorePostings(deps({ judge: null }))([record('a')], { profile: PROFILE }),
    ).rejects.toMatchObject({ code: 'NO_JUDGE' });
  });

  it('returns rows in the judge order, ranked, not in input order', async () => {
    const weak = record('weak');
    const strong = { ...record('strong'), text: record('strong').text };
    // The weak posting has no skill overlap; the strong one has all of it.
    weak.text = `TITLE: Weak\nCOMPANY: Acme\nLOCATION: Remote (Remote)\n\n${'Copywriting and spreadsheets. '.repeat(6)}`;
    const result = await scorePostings(deps())([weak, strong], { profile: PROFILE });
    expect(result.rows.map((r) => r.postingId)).toEqual(['strong', 'weak']);
  });
});
