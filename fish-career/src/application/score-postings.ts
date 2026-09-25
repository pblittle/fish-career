// Scoring is one loop shared by triage, evaluation, and calibration: read
// each posting, ask the judge once, build the row, checkpoint the ledger
// (when the run is a triage), and leave a trace either way. The only
// differences between callers are which postings they pass and whether the
// ledger is marked. Rows come back ranked, so every caller reads the judge's
// order the same way; callers that need a different grouping (variant
// collapse) re-sort on their own.

import { randomUUID } from 'node:crypto';
import { rowFromAnswers, type TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import { type PostingRecord, postingHash } from '../domain/posting.js';
import { rankRows } from '../domain/ranking.js';
import { profileHash, RUBRIC_VERSION, stateFor } from '../domain/rubric.js';
import type { CareerDependencies } from './dependencies.js';

export interface ScoreOptions {
  profile: string;
  markLedger?: boolean;
  runId?: string;
}

export interface ScoreResult {
  rows: TriageRow[];
  errors: string[];
  runId: string;
}

export const scorePostings =
  (deps: CareerDependencies) =>
  async (records: PostingRecord[], opts: ScoreOptions): Promise<ScoreResult> => {
    const judge = deps.judge;
    if (!judge) {
      throw new ApplicationError(
        'NO_JUDGE',
        'No judge is configured. Put a TypeSafe API key in FISH_HOME/.env, or set FISH_JUDGE=fake for the stand-in judge.',
      );
    }
    const hash = profileHash(opts.profile);
    const provenance = { profileHash: hash, rubric: RUBRIC_VERSION };
    // One run ID per scoring call, so every trace can be read back as a run.
    const runId = opts.runId ?? randomUUID();
    const rows: TriageRow[] = [];
    const errors: string[] = [];
    for (const record of records) {
      const started = Date.now();
      const textHash = postingHash(record.text);
      try {
        const call = await judge.ask(stateFor(opts.profile, record.text));
        const row = rowFromAnswers(record.id, call.answers, {
          title: record.title,
          company: record.company,
        });
        rows.push(row);
        if (opts.markLedger) {
          await deps.ledger.mark({ [record.id]: row.composite }, provenance);
        }
        await deps.traces.write({
          at: deps.clock.now().toISOString(),
          runId,
          postingId: record.id,
          postingHash: textHash,
          status: 'ok',
          latencyMs: call.latencyMs,
          attempts: call.attempts,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          model: call.model,
          profileHash: hash,
          rubric: RUBRIC_VERSION,
          version: deps.version,
          answers: call.answers,
        });
      } catch (err) {
        errors.push(`${record.id}: ${String((err as Error).message ?? err)}`);
        await deps.traces.write({
          at: deps.clock.now().toISOString(),
          runId,
          postingId: record.id,
          postingHash: textHash,
          status: 'error',
          latencyMs: Date.now() - started,
          inputTokens: 0,
          outputTokens: 0,
          profileHash: hash,
          rubric: RUBRIC_VERSION,
          version: deps.version,
          error: String((err as Error).message ?? err),
        });
      }
    }
    return { rows: rankRows(rows), errors, runId };
  };
