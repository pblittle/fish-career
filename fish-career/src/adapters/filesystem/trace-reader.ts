import { readFileSync } from 'node:fs';
import type { TraceReader } from '../../ports/trace-reader.js';
import type { TraceRecord } from '../../ports/trace-sink.js';

// The JSONL file is append-only; reading the tail means reading the whole
// file, which is fine at this scale and keeps the format replayable.
export const jsonlTraceReader = (path: string): TraceReader => ({
  async recent(limit: number): Promise<TraceRecord[]> {
    if (limit <= 0) return [];
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return [];
    }
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .slice(-limit)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as TraceRecord];
        } catch {
          return [];
        }
      });
  },
});
