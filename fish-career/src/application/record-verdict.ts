import { ApplicationError } from '../domain/errors.js';
import { type PostingId, postingIdFromFile } from '../domain/posting.js';
import { profileHash, RUBRIC_VERSION } from '../domain/rubric.js';
import { isGrade, type Verdict } from '../domain/verdicts.js';
import type { CareerDependencies } from './dependencies.js';

export interface RecordVerdictResult {
  verdict: Verdict;
  replaced: boolean;
  graded: number;
  pending: number;
}

// The verdict store is human ground truth, so a corrupt read is a refusal,
// not a reset: recording over it would destroy judgments that no rescore can
// reproduce. The ledger can treat corruption as empty because scores are
// recomputable; verdicts are not.
export const requireVerdicts = async (
  deps: CareerDependencies,
): Promise<Record<PostingId, Verdict>> => {
  const read = await deps.verdicts.read();
  if (!read.ok) {
    throw new ApplicationError(
      'VERDICTS_UNREADABLE',
      'The verdict store could not be read; fix or remove state/verdicts.json. Nothing was recorded or measured.',
    );
  }
  return read.verdicts;
};

export const recordVerdict =
  (deps: CareerDependencies) =>
  async (input: { postingId: PostingId; label: number }): Promise<RecordVerdictResult> => {
    const postingId = postingIdFromFile(input.postingId);
    if (!isGrade(input.label)) {
      throw new ApplicationError(
        'INVALID_GRADE',
        `A verdict label is 0, 1, 2, or 3; got ${String(input.label)}.`,
      );
    }
    const posting = await deps.postings.get(postingId);
    if (!posting) {
      throw new ApplicationError(
        'POSTING_NOT_FOUND',
        `No posting in the cache named ${postingId}.`,
      );
    }
    const verdicts = await requireVerdicts(deps);
    const profile = await deps.profile.read();
    const verdict: Verdict = {
      postingId,
      label: input.label,
      profileHash: profileHash(profile),
      rubric: RUBRIC_VERSION,
      at: deps.clock.now().toISOString(),
    };
    const replaced = verdicts[postingId] !== undefined;
    await deps.verdicts.save(verdict);

    // The counts describe the whole cache: graded is every cached posting
    // with a verdict, pending is the rest.
    const cached = await deps.postings.list();
    const graded = cached.filter((r) => verdicts[r.id] !== undefined || r.id === postingId).length;
    return { verdict, replaced, graded, pending: cached.length - graded };
  };
