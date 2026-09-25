// Explain one posting: ask the judge, return the raw typed answers alongside
// the row they produce. The CLI prints them; a host can too. Preview is the
// same request without the call, for inspecting what would be sent.

import { type JevAnswers, rowFromAnswers, type TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import type { PostingId } from '../domain/posting.js';
import { profileHash, questions, RUBRIC_VERSION, stateFor } from '../domain/rubric.js';
import type { CareerDependencies } from './dependencies.js';

export interface Explanation {
  row: TriageRow;
  answers: JevAnswers;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Preview {
  state: string;
  model: string;
  questions: typeof questions;
}

const requireProfileAndRecord = async (deps: CareerDependencies, postingId: PostingId) => {
  const profile = await deps.profile.read();
  if (!profile) {
    throw new ApplicationError(
      'NO_PROFILE',
      'No profile yet. Write one first: every score is a judgment against it.',
    );
  }
  const record = await deps.postings.get(postingId);
  if (!record) {
    throw new ApplicationError('POSTING_NOT_FOUND', `No posting in the cache named ${postingId}.`);
  }
  return { profile, record };
};

export const explainPosting =
  (deps: CareerDependencies) =>
  async (input: { postingId: PostingId }): Promise<Explanation> => {
    const { profile, record } = await requireProfileAndRecord(deps, input.postingId);
    const judge = deps.judge;
    if (!judge) {
      throw new ApplicationError(
        'NO_JUDGE',
        'No judge is configured. Put a TypeSafe API key in FISH_HOME/.env, or set FISH_JUDGE=fake for the stand-in judge.',
      );
    }
    const call = await judge.ask(stateFor(profile, record.text)).catch(async (err) => {
      // Every judge call leaves a trace, successes and failures alike.
      await deps.traces.write({
        at: deps.clock.now().toISOString(),
        postingId: record.id,
        status: 'error',
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        profileHash: profileHash(profile),
        rubric: RUBRIC_VERSION,
        error: String((err as Error).message ?? err),
      });
      throw err;
    });
    const row = rowFromAnswers(record.id, call.answers, {
      title: record.title,
      company: record.company,
    });
    await deps.traces.write({
      at: deps.clock.now().toISOString(),
      postingId: record.id,
      status: 'ok',
      latencyMs: call.latencyMs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      model: call.model,
      profileHash: profileHash(profile),
      rubric: RUBRIC_VERSION,
      answers: call.answers,
    });
    return {
      row,
      answers: call.answers,
      model: call.model,
      latencyMs: call.latencyMs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
    };
  };

export const previewPosting =
  (deps: CareerDependencies) =>
  async (input: { postingId: PostingId }): Promise<Preview> => {
    const { profile, record } = await requireProfileAndRecord(deps, input.postingId);
    return {
      state: stateFor(profile, record.text),
      model: 'jev-latest',
      questions,
    };
  };
