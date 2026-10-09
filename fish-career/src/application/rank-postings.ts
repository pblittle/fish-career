import type { TriageRow } from '../domain/answers.js';
import { ApplicationError } from '../domain/errors.js';
import { stale, unscored } from '../domain/ledger.js';
import { type PostingId, postingIdFromFile } from '../domain/posting.js';
import { profileHash, RUBRIC_VERSION } from '../domain/rubric.js';
import { offTargetPhrase } from '../domain/skip-titles.js';
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
  // Cached postings not scored because their titles are on the skip list.
  offTarget: number;
  stale: PostingId[];
  runId: string;
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
    let offTarget = 0;
    let staleIds: PostingId[] = [];

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
      // The skip list holds here too: a cached posting whose title the
      // operator never wants costs no judge call. Naming it scores it.
      const phrases = (await deps.skipTitles?.read()) ?? [];
      const onTarget = records.filter((r) => !offTargetPhrase(r.title, phrases));
      offTarget = records.length - onTarget.length;
      const ledger = await deps.ledger.read();
      if (!ledger.ok) {
        // A corrupt ledger must not become an empty one: treating it as empty
        // would rescore the whole cache at the operator's expense and then
        // overwrite the file. Refuse before any judge call; an explicit slice
        // still works because it never reads or marks the ledger.
        throw new ApplicationError(
          'LEDGER_UNREADABLE',
          'The scored ledger could not be read; fix or remove state/scored.json. Nothing was scored.',
        );
      }
      const ids = onTarget.map((r) => r.id);
      staleIds = stale(ids, ledger.entries, provenance);
      candidates = onTarget;
      if (!input.rescore) {
        const due = new Set(unscored(ids, ledger.entries, provenance));
        candidates = onTarget.filter((r) => due.has(r.id));
        skipped = onTarget.length - candidates.length;
      }
    }

    if (candidates.length === 0) {
      const listed = offTarget > 0 ? `, or has a title on skip-titles.txt (${offTarget})` : '';
      throw new ApplicationError(
        'NOTHING_TO_SCORE',
        records.length === 0
          ? 'The posting cache is empty. Fetch first.'
          : `Every posting in the cache has already been scored under the current profile and rubric${listed}. Rescore to redo them.`,
      );
    }

    const markLedger = input.postingIds === undefined;
    const { rows, errors, runId } = await scorePostings(deps)(candidates, { profile, markLedger });
    return {
      rows,
      errors,
      scored: rows.map((r) => r.postingId),
      skipped,
      offTarget,
      stale: staleIds,
      runId,
    };
  };
