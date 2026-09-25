import type { JevAnswers } from '../domain/answers.js';
import type { PostingId } from '../domain/posting.js';

// One judge call's record: what was asked, what it cost, which judgment it
// was asked against, and which run it belonged to. A sink decides the format
// and destination (JSONL today, an observability platform optionally).
export interface TraceRecord {
  at: string;
  runId: string;
  postingId: PostingId;
  postingHash?: string;
  status: 'ok' | 'error';
  latencyMs: number;
  attempts?: number;
  inputTokens: number;
  outputTokens: number;
  model?: string;
  profileHash: string;
  rubric: number;
  version?: string;
  answers?: JevAnswers;
  error?: string;
}

export interface TraceSink {
  write(record: TraceRecord): Promise<void>;
}
