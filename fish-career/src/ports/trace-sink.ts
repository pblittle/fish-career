import type { JevAnswers } from '../domain/answers.js';
import type { PostingId } from '../domain/posting.js';

// One judge call's record: what was asked, what it cost, which judgment it
// was asked against. A sink decides the format and destination (JSONL today,
// an observability platform later).
export interface TraceRecord {
  at: string;
  postingId: PostingId;
  status: 'ok' | 'error';
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model?: string;
  profileHash: string;
  rubric: number;
  answers?: JevAnswers;
  error?: string;
}

export interface TraceSink {
  write(record: TraceRecord): Promise<void>;
}
