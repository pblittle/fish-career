import type { TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import { type EvalOutcome, evaluatePreferences, type Preference } from '../domain/preferences.js';
import type { CareerDependencies } from './dependencies.js';
import { scorePostings } from './score-postings.js';

export interface EvaluateOutcome {
  evaluation: EvalOutcome;
  preferences: Preference[];
  rows: TriageRow[];
  errors: string[];
}

// The cheaper measurement: the postings preferences name are scored and the
// ranking is held to the pairwise order the profile already states. Never
// marks the ledger: it is a measurement, not a run.
export const evaluateRanking = (deps: CareerDependencies) => async (): Promise<EvaluateOutcome> => {
  const profile = await deps.profile.read();
  if (!profile) {
    throw new ApplicationError(
      'NO_PROFILE',
      'No profile yet. Write one first: every score is a judgment against it.',
    );
  }
  const preferences = await deps.preferences.read();
  if (preferences.length === 0) {
    throw new ApplicationError(
      'NO_PREFERENCES',
      'No preferences on file. Name the pairs the rubric must respect, each with the profile line it came from.',
    );
  }
  const records = await deps.postings.list();
  const byId = new Map(records.map((r) => [r.id, r]));
  const wanted = [...new Set(preferences.flatMap((p) => [p.better, p.worse]))].filter((id) =>
    byId.has(id),
  );
  if (wanted.length === 0) {
    throw new ApplicationError(
      'NO_PREFERENCES',
      'None of the postings named in preferences are in the cache.',
    );
  }
  const { rows, errors } = await scorePostings(deps)(
    wanted.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r !== undefined),
    { profile },
  );
  return { evaluation: evaluatePreferences(rows, preferences), preferences, rows, errors };
};
