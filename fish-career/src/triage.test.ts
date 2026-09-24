import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rowFromAnswers, scoreFiles } from './triage.js';

const answersFor = (score: number) => ({
  hard_blocker: { noul: 0 },
  skills: { score, confidence: 0.9 },
  level: { score: 3, confidence: 0.9 },
  location: { score: 3, confidence: 0.9 },
  comp: { score: 3, confidence: 0.9 },
  domain: { score: 3, confidence: 0.9 },
});

const respond = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => `status ${status}`,
  }) as unknown as Awaited<ReturnType<typeof fetch>>;

const cache = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-score-'));
  writeFileSync(join(dir, 'a.txt'), 'TITLE: Role A\nCOMPANY: Acme\n\nbody body body body body');
  writeFileSync(join(dir, 'b.txt'), 'TITLE: Role B\nCOMPANY: Beta\n\nbody body body body body');
  return dir;
};

afterEach(() => vi.unstubAllGlobals());

describe('rowFromAnswers', () => {
  it('clamps malformed judge output instead of emitting NaN', () => {
    const row = rowFromAnswers(
      'x.txt',
      {
        hard_blocker: { noul: 2 },
        skills: { score: Number.NaN, confidence: 3 },
        level: { score: 'nine' },
        location: { score: -1, confidence: -1 },
        comp: {},
        domain: { score: 2, confidence: 0.5 },
      } as never,
      { title: 'T', company: 'C' },
    );
    expect(row.blocker).toBe(1);
    expect(row.dims.skills?.value).toBe(0);
    expect(row.dims.skills?.confidence).toBe(1);
    expect(row.dims.location?.value).toBe(0);
    expect(row.dims.location?.confidence).toBe(0);
    expect(row.dims.domain?.value).toBeCloseTo(2 / 3);
    expect(row.dims.domain?.confidence).toBe(0.5);
  });
});

describe('scoreFiles', () => {
  it('traces every call and checkpoints every scored row', async () => {
    const dir = cache();
    vi.stubGlobal('fetch', (async () =>
      respond(200, {
        answers: answersFor(3),
        usage: { input_tokens: 1, output_tokens: 1 },
      })) as typeof fetch);
    const marks: [string, number][] = [];
    const tracePath = join(dir, 'traces.jsonl');
    const { rows, errors } = await scoreFiles(['a.txt', 'b.txt'], {
      profile: 'p',
      postingsDir: dir,
      tracePath,
      checkpoint: (f, c) => marks.push([f, c]),
    });
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(marks.map((m) => m[0])).toEqual(['a.txt', 'b.txt']);
    const traces = readFileSync(tracePath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(traces).toHaveLength(2);
    expect(traces[0]).toMatchObject({ file: 'a.txt', status: 'ok', rubric: 1 });
    expect(traces[0].answers.hard_blocker).toEqual({ noul: 0 });
  });

  it('keeps scoring after a hard failure and traces the error', async () => {
    const dir = cache();
    let n = 0;
    vi.stubGlobal('fetch', (async () => {
      n += 1;
      return n === 1
        ? respond(400, { error: 'bad request' })
        : respond(200, {
            answers: answersFor(3),
            usage: { input_tokens: 1, output_tokens: 1 },
          });
    }) as typeof fetch);
    const marks: string[] = [];
    const tracePath = join(dir, 'traces.jsonl');
    const { rows, errors } = await scoreFiles(['a.txt', 'b.txt'], {
      profile: 'p',
      postingsDir: dir,
      tracePath,
      checkpoint: (f) => marks.push(f),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^a\.txt: /);
    expect(rows.map((r) => r.file)).toEqual(['b.txt']);
    expect(marks).toEqual(['b.txt']);
    const traces = readFileSync(tracePath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(traces[0]).toMatchObject({ file: 'a.txt', status: 'error' });
    expect(traces[1]).toMatchObject({ file: 'b.txt', status: 'ok' });
  });
});
