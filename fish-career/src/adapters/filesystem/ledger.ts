import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type LedgerEntry,
  type LedgerProvenance,
  type LedgerRead,
  parseEntry,
} from '../../domain/ledger.js';
import { type PostingId, postingIdFromFile } from '../../domain/posting.js';
import type { Ledger } from '../../ports/ledger.js';
import { writeFileAtomic } from './home.js';

// A corrupt ledger is REPORTED, not silently treated as empty: an unnoticed
// reset means paying for a full rescore the operator did not ask for.
const read = (path: string): LedgerRead => {
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
    const entries: Record<PostingId, LedgerEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = parseEntry(value);
      if (!entry) return { ok: false, entries: {} };
      // Ledgers written before stable IDs keyed on filenames.
      entries[postingIdFromFile(key)] = entry;
    }
    return { ok: true, entries };
  } catch {
    return { ok: false, entries: {} };
  }
};

export const fileLedger = (path: string): Ledger => ({
  async read(): Promise<LedgerRead> {
    return read(path);
  },
  async mark(scores: Record<PostingId, number>, provenance: LedgerProvenance): Promise<void> {
    const prior = read(path);
    const at = new Date().toISOString();
    const incoming: Record<PostingId, LedgerEntry> = Object.fromEntries(
      Object.entries(scores).map(([id, score]) => [
        id,
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
  },
});
