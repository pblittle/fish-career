import { type CalibrationRecord, spearman } from '../domain/calibration.js';
import { ApplicationError } from '../domain/errors.js';
import type { PostingId } from '../domain/posting.js';
import { createSeededRandom } from '../domain/random.js';
import type { CareerDependencies } from './dependencies.js';
import { scorePostings } from './score-postings.js';

export interface CalibrationStart {
  postingIds: PostingId[];
  seed: number;
  startedAt: string;
}

export interface CalibrationResult {
  record: CalibrationRecord;
  errors: string[];
  previousRho?: number | null;
}

const requireProfile = async (deps: CareerDependencies): Promise<string> => {
  const profile = await deps.profile.read();
  if (!profile) {
    throw new ApplicationError(
      'NO_PROFILE',
      'No profile yet. Write one first: every score is a judgment against it.',
    );
  }
  return profile;
};

// Draw a stratified slice: one posting per company per round, shuffled with a
// recorded seed, so the same slice can be redrawn and a disagreement
// re-examined. With fewer companies than the requested count, later rounds
// take a second and third posting from the same company rather than refusing
// to draw.
export const startCalibration =
  (deps: CareerDependencies) =>
  async (input: { count?: number; seed?: number } = {}): Promise<CalibrationStart> => {
    const count = Math.max(2, input.count ?? 10);
    const records = await deps.postings.list();
    if (records.length < 2) {
      throw new ApplicationError(
        'NOTHING_TO_SCORE',
        'Not enough postings cached; fetch postings first.',
      );
    }
    const byCompany = new Map<string, typeof records>();
    for (const record of records) {
      byCompany.set(record.company, [...(byCompany.get(record.company) ?? []), record]);
    }
    const seed = input.seed ?? deps.clock.now().getTime();
    const random = createSeededRandom(seed);
    const companies = random.shuffle([...byCompany.keys()]);
    const groups = companies.map((company) => random.shuffle([...(byCompany.get(company) ?? [])]));
    const postingIds: PostingId[] = [];
    for (let round = 0; postingIds.length < count; round += 1) {
      let added = false;
      for (const group of groups) {
        const pick = group[round];
        if (pick === undefined) continue;
        postingIds.push(pick.id);
        added = true;
        if (postingIds.length >= count) break;
      }
      if (!added) break;
    }
    const startedAt = deps.clock.now().toISOString();
    await deps.calibrations.savePending({ postingIds, seed, startedAt });
    return { postingIds, seed, startedAt };
  };

const measure = async (
  deps: CareerDependencies,
  postingIds: PostingId[],
  humanRanking: PostingId[],
): Promise<{ record: CalibrationRecord; errors: string[] }> => {
  const profile = await requireProfile(deps);
  const records = await deps.postings.list();
  const byId = new Map(records.map((r) => [r.id, r]));
  const { rows, errors } = await scorePostings(deps)(
    postingIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r !== undefined),
    { profile },
  );
  const human = [...humanRanking].sort((a, b) => humanRanking.indexOf(a) - humanRanking.indexOf(b));
  const rho = spearman(
    human.map((_, i) => i),
    human.map((id) => rows.findIndex((r) => r.postingId === id)),
  );
  return {
    record: { at: deps.clock.now().toISOString(), postingIds, humanRanking: human, rho, rows },
    errors,
  };
};

export const submitCalibration =
  (deps: CareerDependencies) =>
  async (input: { ranking: PostingId[] }): Promise<CalibrationResult> => {
    const pending = await deps.calibrations.readPending();
    if (!pending) {
      throw new ApplicationError(
        'NO_PENDING_CALIBRATION',
        'No calibration is pending; start one first.',
      );
    }
    const missing = pending.postingIds.filter((id) => !input.ranking.includes(id));
    if (missing.length > 0) {
      throw new ApplicationError(
        'INVALID_RANKING',
        `The ranking is missing ${missing.length} of the pending slice's postings; rank all of them so the correlation means something.`,
      );
    }
    const { record, errors } = await measure(deps, pending.postingIds, input.ranking);
    await deps.calibrations.save(record);
    return { record, errors };
  };

export const rescoreCalibration =
  (deps: CareerDependencies) => async (): Promise<CalibrationResult> => {
    const latest = await deps.calibrations.latest();
    if (!latest) {
      throw new ApplicationError(
        'NO_CALIBRATION_HISTORY',
        'No calibration on record yet; start one first.',
      );
    }
    const { record, errors } = await measure(deps, latest.postingIds, latest.humanRanking);
    await deps.calibrations.save(record);
    return { record, errors, previousRho: latest.rho };
  };
