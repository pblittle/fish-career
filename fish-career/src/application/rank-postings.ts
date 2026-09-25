import type { TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import { stale, unscored } from '../domain/ledger.js';
import { type PostingId, postingIdFromFile } from '../domain/posting.js';
import { profileHash, RUBRIC_VERSION } from '../domain/rubric.js';
import type { CareerDependencies } from './dependencies.js';
import { scorePostings } from './score-postings.js';

export interface RankInput {
  postingIds?: PostingId[];
  rescore?: boolean;
}

export interface RankOutcome {
  rows: TriageRow[];
  errors: string[];
  scored: PostingId[];
  skipped: number;
  stale: PostingId[];
  ledgerOk: boolean;
}

export const rankPostings =
  (deps: CareerDependencies) =>
  async (input: RankInput = {}): Promise<RankOutcome> => {
    const profile = await deps.profile.read();
    if (!profile) {
      throw new ApplicationError(
        'NO_PROFILE',
        'No profile yet. Write one first: every score is a judgment against it.',
      );
    }
    const records = await deps.postings.list();
    const byId = new Map(records.map((r) => [r.id, r]));
    const provenance = { profileHash: profileHash(profile), rubric: RUBRIC_VERSION };

    let candidates = records;
    let skipped = 0;
    let staleIds: PostingId[] = [];
    let ledgerOk = true;

    if (input.postingIds !== undefined) {
      const wanted = input.postingIds.map(postingIdFromFile);
      const missing = wanted.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        throw new ApplicationError(
          'POSTING_NOT_FOUND',
          `No posting in the cache named ${missing.join(', ')}.`,
        );
      }
      candidates = wanted
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r !== undefined);
    } else {
      const ledger = await deps.ledger.read();
      ledgerOk = ledger.ok;
      const ids = records.map((r) => r.id);
      staleIds = stale(ids, ledger.entries, provenance);
      if (!input.rescore) {
        const due = new Set(unscored(ids, ledger.entries, provenance));
        candidates = records.filter((r) => due.has(r.id));
        skipped = records.length - candidates.length;
      }
    }

    if (candidates.length === 0) {
      throw new ApplicationError(
        'NOTHING_TO_SCORE',
        'Every posting in the cache has already been scored under the current profile and rubric. Rescore to redo them.',
      );
    }

    const markLedger = input.postingIds === undefined;
    const { rows, errors } = await scorePostings(deps)(candidates, { profile, markLedger });
    return {
      rows,
      errors,
      scored: rows.map((r) => r.postingId),
      skipped,
      stale: staleIds,
      ledgerOk,
    };
  };
