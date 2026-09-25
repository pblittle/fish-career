import { describe, expect, it, vi } from 'vitest';
import type { CareerApplication } from '../../application/career-application.js';
import { ApplicationError } from '../../domain/errors.js';
import { runCli } from './cli.js';

// The CLI is a rendering layer; these tests pin that each command calls the
// application use case and formats what comes back, with no logic of its own.
const stubApp = (over: Partial<CareerApplication> = {}): CareerApplication =>
  ({
    fetchPostings: vi.fn(async () => ({
      arrivals: [],
      failures: [],
      perCompany: [],
      firstRun: false,
    })),
    rankPostings: vi.fn(async () => ({
      rows: [],
      errors: [],
      scored: [],
      skipped: 0,
      stale: [],
      ledgerOk: true,
    })),
    evaluateRanking: vi.fn(async () => ({
      evaluation: { satisfied: 0, total: 0, violations: [] },
      preferences: [],
      rows: [],
      errors: [],
    })),
    startCalibration: vi.fn(async () => ({ postingIds: [], seed: 1, startedAt: '' })),
    submitCalibration: vi.fn(),
    rescoreCalibration: vi.fn(),
    probeCompany: vi.fn(async () => ({ slug: 'acme', counts: {}, samples: [] })),
    addCompany: vi.fn(async () => ({
      added: true,
      entry: { name: 'A', provider: 'ashby', slug: 'a' },
    })),
    removeCompany: vi.fn(async () => ({ removed: true, name: 'A' })),
    listWatchlist: vi.fn(async () => []),
    getProfile: vi.fn(async () => ''),
    updateProfile: vi.fn(async () => {}),
    listPostings: vi.fn(async () => []),
    readPosting: vi.fn(),
    rubric: () => ({ version: 1, dimensions: [], blockerInstructions: '' }),
    ...over,
  }) as CareerApplication;

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

describe('runCli', () => {
  it('fetch calls the use case and prints the per-company diff', async () => {
    const app = stubApp({
      fetchPostings: vi.fn(async () => ({
        arrivals: [],
        failures: [],
        perCompany: [{ name: 'Acme', total: 3, remote: 2, written: 1 }],
        firstRun: true,
      })),
    });
    const sink = io();
    const code = await runCli(['fetch'], { app, io: sink.io });
    expect(code).toBe(0);
    expect(app.fetchPostings).toHaveBeenCalled();
    expect(sink.out.join('\n')).toContain('Acme: 3 postings, 2 remote, 1 new');
    expect(sink.out.join('\n')).toContain('First run');
  });

  it('triage passes explicit posting IDs through and prints the table', async () => {
    const app = stubApp({
      rankPostings: vi.fn(async () => ({
        rows: [],
        errors: [],
        scored: [],
        skipped: 2,
        stale: [],
        ledgerOk: true,
      })),
    });
    const sink = io();
    await runCli(['triage', 'acme-1', 'acme-2'], { app, io: sink.io });
    expect(app.rankPostings).toHaveBeenCalledWith({
      postingIds: ['acme-1', 'acme-2'],
      rescore: false,
    });
    expect(sink.out.join('\n')).toContain('Skipped 2 already-scored postings');
  });

  it('reports an application failure with its message and a non-zero exit', async () => {
    const app = stubApp({
      rankPostings: vi.fn(async () => {
        throw new ApplicationError('NO_PROFILE', 'No profile yet.');
      }),
    });
    const sink = io();
    const code = await runCli(['triage'], { app, io: sink.io });
    expect(code).toBe(1);
    expect(sink.err.join('\n')).toContain('No profile yet.');
  });

  it('treats nothing-to-score as a clean exit', async () => {
    const app = stubApp({
      rankPostings: vi.fn(async () => {
        throw new ApplicationError('NOTHING_TO_SCORE', 'Nothing new.');
      }),
    });
    const sink = io();
    expect(await runCli(['triage'], { app, io: sink.io })).toBe(0);
  });

  it('watchlist add requires all three arguments', async () => {
    const sink = io();
    expect(await runCli(['watchlist', 'add', 'Acme'], { app: stubApp(), io: sink.io })).toBe(1);
    expect(sink.err.join('\n')).toContain('Usage: fish watchlist add');
  });
});
