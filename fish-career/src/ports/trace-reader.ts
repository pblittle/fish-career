import type { TraceRecord } from './trace-sink.js';

// Reading traces back: the resource layer shows recent judge calls, and a
// future evaluation report reads runs. Kept separate from TraceSink so a
// write-only destination (an observability API) can implement just the sink.
export interface TraceReader {
  recent(limit: number): Promise<TraceRecord[]>;
}
