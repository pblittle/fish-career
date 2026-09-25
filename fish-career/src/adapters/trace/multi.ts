import type { TraceRecord, TraceSink } from '../../ports/trace-sink.js';

// Fan-out: write the same record to every sink. Used to keep the local JSONL
// replay while shipping the same run to an observability platform.
export const multiTraceSink = (sinks: TraceSink[]): TraceSink => ({
  async write(record: TraceRecord): Promise<void> {
    for (const sink of sinks) {
      await sink.write(record);
    }
  },
});
