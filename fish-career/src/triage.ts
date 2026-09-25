// The scoring engine: score named posting files against the profile,
// return ranked rows. Ledger and sampling decisions stay with the caller;
// this file only reads files, calls Jev, and leaves the two records a run
// owes: a trace per call and a checkpoint per scored row.

import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  callJev,
  composite,
  DIMENSIONS,
  type JevAnswers,
  type JevCall,
  profileHash,
  RUBRIC_VERSION,
  rankRows,
  stateFor,
  type TriageRow,
} from './jev.js';

// One judge call's record: what was asked, what it cost, which judgment it
// was asked against. Appended as JSONL so a run can be audited or replayed.
export interface TraceRecord {
  at: string;
  file: string;
  status: 'ok' | 'error';
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  profileHash: string;
  rubric: number;
  answers?: JevAnswers;
  error?: string;
}

export interface ScoreOutcome {
  rows: TriageRow[];
  errors: string[];
}

// One table row from judge answers. Split out so the eval slice can be
// rebuilt from recorded answers with no network and no second copy of the
// scoring math.
export const rowFromAnswers = (
  file: string,
  answers: JevAnswers,
  meta: { title: string; company: string },
): TriageRow => {
  const dims: TriageRow['dims'] = {};
  for (const d of DIMENSIONS) {
    const top = d.criteria.length - 1;
    const score = answers[d.id]?.score;
    dims[d.id] = {
      value: Math.min(
        1,
        Math.max(0, (typeof score === 'number' && Number.isFinite(score) ? score : 0) / top),
      ),
      confidence: Math.min(1, Math.max(0, answers[d.id]?.confidence ?? 0)),
    };
  }
  return {
    file,
    title: meta.title,
    company: meta.company,
    composite: composite(answers),
    dims,
    blocker: Math.min(1, Math.max(0, answers.hard_blocker?.noul ?? 0)),
  };
};

export async function scoreFiles(
  files: string[],
  opts: {
    profile: string;
    postingsDir: string;
    tracePath?: string;
    checkpoint?: (file: string, composite: number) => void;
    judge?: (state: string) => Promise<JevCall>;
  },
): Promise<ScoreOutcome> {
  const judge = opts.judge ?? callJev;
  const hash = profileHash(opts.profile);
  const rows: TriageRow[] = [];
  const errors: string[] = [];
  const trace = (record: TraceRecord) => {
    if (opts.tracePath) appendFileSync(opts.tracePath, `${JSON.stringify(record)}\n`);
  };
  for (const file of files) {
    let body: string;
    try {
      body = readFileSync(join(opts.postingsDir, file), 'utf8');
    } catch {
      errors.push(`${file}: not found in the postings cache`);
      continue;
    }
    const started = Date.now();
    try {
      const call = await judge(stateFor(opts.profile, body));
      const row = rowFromAnswers(file, call.answers, {
        title: body.match(/^TITLE: (.+)$/m)?.[1] ?? file,
        company: body.match(/^COMPANY: (.+)$/m)?.[1] ?? '?',
      });
      rows.push(row);
      opts.checkpoint?.(file, row.composite);
      trace({
        at: new Date().toISOString(),
        file,
        status: 'ok',
        latencyMs: call.latencyMs,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        profileHash: hash,
        rubric: RUBRIC_VERSION,
        answers: call.answers,
      });
    } catch (err) {
      errors.push(`${file}: ${String((err as Error).message ?? err)}`);
      trace({
        at: new Date().toISOString(),
        file,
        status: 'error',
        latencyMs: Date.now() - started,
        inputTokens: 0,
        outputTokens: 0,
        profileHash: hash,
        rubric: RUBRIC_VERSION,
        error: String((err as Error).message ?? err),
      });
    }
  }
  return { rows: rankRows(rows), errors };
}
