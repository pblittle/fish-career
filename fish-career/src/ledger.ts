// The scored ledger: which postings have already been triaged, and under
// which profile and rubric. Both surfaces read and mark through this module
// so the skip-repeat semantics cannot drift between them, the same reason
// the fetch engine is shared.
//
// PROVENANCE RIDES EVERY ENTRY because a stored number means "matched this
// much against that judgment". Change the profile or the weights and the old
// number is no longer the current judgment, so the next run re-scores it
// without being asked. Invalidation is not the operator's job. An entry with
// no provenance predates this rule and is trusted once.
//
// A corrupt ledger is REPORTED, not silently treated as empty: an unnoticed
// reset means paying for a full rescore the operator did not ask for.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomic } from './config.js';

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
  entries: Record<string, LedgerEntry>;
}

// A pre-provenance entry is a bare number: scored, history unknown.
const parseEntry = (value: unknown): LedgerEntry | null => {
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

export const readLedger = (path: string): LedgerRead => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { ok: true, entries: {} }; // No ledger yet: a true empty.
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, entries: {} };
    }
    const entries: Record<string, LedgerEntry> = {};
    for (const [file, value] of Object.entries(parsed)) {
      const entry = parseEntry(value);
      if (!entry) return { ok: false, entries: {} };
      entries[file] = entry;
    }
    return { ok: true, entries };
  } catch {
    return { ok: false, entries: {} };
  }
};

const isStale = (e: LedgerEntry, expected: LedgerProvenance | undefined): boolean =>
  expected !== undefined &&
  e.profileHash !== null &&
  (e.profileHash !== expected.profileHash || e.rubric !== expected.rubric);

export const unscored = (
  files: string[],
  entries: Record<string, LedgerEntry>,
  expected?: LedgerProvenance,
): string[] =>
  files.filter((f) => {
    const e = entries[f];
    return e === undefined || isStale(e, expected);
  });

// Entries scored under a judgment that is no longer current. Same test as
// unscored's, named for the run's explanatory line.
export const stale = (
  files: string[],
  entries: Record<string, LedgerEntry>,
  expected: LedgerProvenance,
): string[] =>
  files.filter((f) => {
    const entry = entries[f];
    return entry !== undefined && isStale(entry, expected);
  });

export const markScored = (
  path: string,
  scores: Record<string, number>,
  provenance: LedgerProvenance,
): void => {
  const prior = readLedger(path);
  const at = new Date().toISOString();
  const incoming: Record<string, LedgerEntry> = Object.fromEntries(
    Object.entries(scores).map(([file, score]) => [
      file,
      {
        score: Math.round(score * 1000) / 1000,
        profileHash: provenance.profileHash,
        rubric: provenance.rubric,
        at,
      },
    ]),
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify({ ...prior.entries, ...incoming }, null, 2));
};
