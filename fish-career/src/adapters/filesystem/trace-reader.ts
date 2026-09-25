import { readFileSync } from 'node:fs';
import type { TraceReader } from '../../ports/trace-reader.js';
import type { TraceRecord } from '../../ports/trace-sink.js';

// The JSONL file is append-only; reading the tail means reading the whole
// file, which is fine at this scale and keeps the format replayable.
const readAll = (path: string): TraceRecord[] => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TraceRecord];
      } catch {
        return [];
      }
    });
};

export const jsonlTraceReader = (path: string): TraceReader => ({
  async recent(limit: number): Promise<TraceRecord[]> {
    if (limit <= 0) return [];
    return readAll(path).slice(-limit);
  },
  async byRun(runId: string): Promise<TraceRecord[]> {
    return readAll(path).filter((record) => record.runId === runId);
  },
  async latestRun(): Promise<{ runId: string; records: TraceRecord[] } | null> {
    const all = readAll(path);
    const last = all[all.length - 1];
    if (last === undefined) return null;
    return { runId: last.runId, records: all.filter((record) => record.runId === last.runId) };
  },
});
