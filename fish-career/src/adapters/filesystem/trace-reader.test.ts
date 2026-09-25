import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TraceRecord } from '../../ports/trace-sink.js';
import { jsonlTraceReader } from './trace-reader.js';

const record = (runId: string, postingId: string): TraceRecord => ({
  at: '2026-09-25T12:00:00.000Z',
  runId,
  postingId,
  status: 'ok',
  latencyMs: 1,
  inputTokens: 0,
  outputTokens: 0,
  profileHash: 'abc',
  rubric: 1,
});

const file = (lines: string[]): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'fish-traces-')), 'traces.jsonl');
  writeFileSync(path, lines.join('\n'));
  return path;
};

describe('jsonlTraceReader', () => {
  it('is empty when the trace file is missing or a limit is non-positive', async () => {
    expect(await jsonlTraceReader('/nope/traces.jsonl').recent(10)).toEqual([]);
    expect(await jsonlTraceReader(file(['{}'])).recent(0)).toEqual([]);
  });

  it('returns the tail and skips malformed lines', async () => {
    const reader = jsonlTraceReader(
      file([JSON.stringify(record('r1', 'a')), 'not json', JSON.stringify(record('r2', 'b'))]),
    );
    const recent = await reader.recent(1);
    expect(recent.map((r) => r.postingId)).toEqual(['b']);
  });

  it('filters one run and finds the latest run', async () => {
    const reader = jsonlTraceReader(
      file([
        JSON.stringify(record('r1', 'a')),
        JSON.stringify(record('r1', 'b')),
        JSON.stringify(record('r2', 'c')),
      ]),
    );
    expect((await reader.byRun('r1')).map((r) => r.postingId)).toEqual(['a', 'b']);
    const latest = await reader.latestRun();
    expect(latest?.runId).toBe('r2');
    expect(latest?.records.map((r) => r.postingId)).toEqual(['c']);
  });

  it('returns null for the latest run when there are no traces', async () => {
    expect(await jsonlTraceReader(file([])).latestRun()).toBeNull();
  });
});
