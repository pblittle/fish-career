import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TraceRecord, TraceSink } from '../../ports/trace-sink.js';

// One JSON object per line: appendable, replayable, and readable with grep.
export const jsonlTraceSink = (path: string): TraceSink => ({
  async write(record: TraceRecord): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`);
  },
});
