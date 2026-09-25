import { fileURLToPath } from 'node:url';
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
      runId: 'run-1',
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
    pendingCalibration: vi.fn(async () => null),
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
    explainPosting: vi.fn(),
    previewPosting: vi.fn(),
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
        runId: 'run-1',
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

  it('postings explain --dry-run prints the request without calling the judge', async () => {
    const previewPosting = vi.fn(async () => ({
      state: 'CANDIDATE PROFILE:\n...\n\nJOB POSTING:\n...',
      model: 'jev-latest',
      questions: {},
    }));
    const app = stubApp({ previewPosting, explainPosting: vi.fn() });
    const sink = io();
    const code = await runCli(['postings', 'explain', 'acme-1', '--dry-run'], { app, io: sink.io });
    expect(code).toBe(0);
    expect(previewPosting).toHaveBeenCalledWith({ postingId: 'acme-1' });
    expect(app.explainPosting).not.toHaveBeenCalled();
    expect(sink.out.join('\n')).toContain('not sent');
  });

  it('postings explain prints the raw answers and cost', async () => {
    const app = stubApp({
      explainPosting: vi.fn(async () => ({
        row: {
          postingId: 'acme-1',
          title: 'Role',
          company: 'Acme',
          composite: 0.5,
          dims: {},
          blocker: 0,
        },
        answers: { hard_blocker: { noul: 0 } },
        model: 'fake-judge',
        latencyMs: 5,
        inputTokens: 10,
        outputTokens: 2,
      })),
    });
    const sink = io();
    const code = await runCli(['postings', 'explain', 'acme-1'], { app, io: sink.io });
    expect(code).toBe(0);
    const text = sink.out.join('\n');
    expect(text).toContain('Full answers for acme-1');
    expect(text).toContain('cost: 10 in / 2 out tokens');
  });

  it('calibrate reuse redraws the recorded slice, and fails cleanly with none', async () => {
    const noPending = stubApp();
    const sinkA = io();
    expect(await runCli(['calibrate', 'reuse'], { app: noPending, io: sinkA.io })).toBe(1);
    expect(sinkA.err.join('\n')).toContain('No saved calibration slice');

    const startCalibration = vi.fn(async () => ({
      postingIds: ['a', 'b'],
      seed: 77,
      startedAt: '',
    }));
    const app = stubApp({
      pendingCalibration: vi.fn(async () => ({ postingIds: ['a', 'b'], seed: 77, startedAt: '' })),
      startCalibration,
    });
    const sink = io();
    expect(await runCli(['calibrate', 'reuse'], { app, io: sink.io })).toBe(0);
    expect(startCalibration).toHaveBeenCalledWith({ count: 2, seed: 77 });
  });

  it('rejects a non-numeric --days instead of silently fetching nothing', async () => {
    const app = stubApp();
    const sink = io();
    expect(await runCli(['fetch', '--days', 'abc'], { app, io: sink.io })).toBe(1);
    expect(sink.err.join('\n')).toContain('--days needs a positive number');
    expect(app.fetchPostings).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range --count', async () => {
    const app = stubApp();
    const sink = io();
    expect(await runCli(['calibrate', 'start', '--count', 'abc'], { app, io: sink.io })).toBe(1);
    expect(sink.err.join('\n')).toContain('--count needs an integer between 2 and 30');
    expect(await runCli(['calibrate', 'start', '--count', '99'], { app, io: sink.io })).toBe(1);
    expect(app.startCalibration).not.toHaveBeenCalled();
  });

  it('quality prints the report from the bundled dataset', async () => {
    const evalDir = fileURLToPath(new URL('../../../eval', import.meta.url));
    const sink = io();
    const code = await runCli(['quality', '--k', '3'], {
      app: stubApp(),
      io: sink.io,
      evalDir,
    });
    expect(code).toBe(0);
    const text = sink.out.join('\n');
    expect(text).toContain('ranking quality against 17 labeled postings');
    expect(text).toContain('precision@3');
  });
});
