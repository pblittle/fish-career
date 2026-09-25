// Scoring is one loop shared by triage, evaluation, and calibration: read
// each posting, ask the judge once, build the row, checkpoint the ledger
// (when the run is a triage), and leave a trace either way. The only
// differences between callers are which postings they pass and whether the
// ledger is marked.

import { rowFromAnswers, type TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import type { PostingRecord } from '../domain/posting.js';
import { profileHash, RUBRIC_VERSION, stateFor } from '../domain/rubric.js';
import type { CareerDependencies } from './dependencies.js';

export interface ScoreOptions {
  profile: string;
  markLedger?: boolean;
}

export interface ScoreResult {
  rows: TriageRow[];
  errors: string[];
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
    const rows: TriageRow[] = [];
    const errors: string[] = [];
    for (const record of records) {
      const started = Date.now();
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
          postingId: record.id,
          status: 'ok',
          latencyMs: call.latencyMs,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          model: call.model,
          profileHash: hash,
          rubric: RUBRIC_VERSION,
          answers: call.answers,
        });
      } catch (err) {
        errors.push(`${record.id}: ${String((err as Error).message ?? err)}`);
        await deps.traces.write({
          at: deps.clock.now().toISOString(),
          postingId: record.id,
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
    return { rows, errors };
  };
