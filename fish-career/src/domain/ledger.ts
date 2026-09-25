// The scored ledger's policy, independent of storage. PROVENANCE RIDES EVERY
// ENTRY because a stored number means "matched this much against that
// judgment": change the profile or the weights and the old number is no
// longer the current judgment, so the next run re-scores it without being
// asked. An entry with no provenance predates this rule and is trusted once.

import type { PostingId } from './posting.js';

export interface LedgerEntry {
  score: number;
  profileHash: string | null;
  rubric: number | null;
  at?: string;
}

export interface LedgerProvenance {
  profileHash: string;
  rubric: number;
}

export interface LedgerRead {
  ok: boolean;
  entries: Record<PostingId, LedgerEntry>;
}

// A pre-provenance entry is a bare number: scored, history unknown.
export const parseEntry = (value: unknown): LedgerEntry | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { score: value, profileHash: null, rubric: null };
  }
  if (typeof value === 'object' && value !== null) {
    const e = value as Record<string, unknown>;
    if (typeof e.score !== 'number' || !Number.isFinite(e.score)) return null;
    return {
      score: e.score,
      profileHash: typeof e.profileHash === 'string' ? e.profileHash : null,
      rubric: typeof e.rubric === 'number' ? e.rubric : null,
      ...(typeof e.at === 'string' ? { at: e.at } : {}),
    };
  }
  return null;
};

const isStale = (e: LedgerEntry, expected: LedgerProvenance | undefined): boolean =>
  expected !== undefined &&
  e.profileHash !== null &&
  (e.profileHash !== expected.profileHash || e.rubric !== expected.rubric);

export const unscored = (
  postingIds: PostingId[],
  entries: Record<PostingId, LedgerEntry>,
  expected?: LedgerProvenance,
): PostingId[] =>
  postingIds.filter((id) => {
    const e = entries[id];
    return e === undefined || isStale(e, expected);
  });

// Entries scored under a judgment that is no longer current. Same test as
// unscored's, named for the run's explanatory line.
export const stale = (
  postingIds: PostingId[],
  entries: Record<PostingId, LedgerEntry>,
  expected: LedgerProvenance,
): PostingId[] =>
  postingIds.filter((id) => {
    const entry = entries[id];
    return entry !== undefined && isStale(entry, expected);
  });
