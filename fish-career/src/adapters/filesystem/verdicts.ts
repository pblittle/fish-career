import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type PostingId, postingIdFromFile } from '../../domain/posting.js';
import {
  parseVerdict,
  upsertVerdict,
  type Verdict,
  type VerdictRead,
} from '../../domain/verdicts.js';
import type { VerdictStore } from '../../ports/stores.js';
import { writeFileAtomic } from './home.js';

// A corrupt verdict store is REPORTED, not silently treated as empty: a
// verdict is the operator's own judgment and cannot be recomputed by paying
// for another judge run, so overwriting it would destroy ground truth. The
// application refuses to record while read() is not ok.
const read = (path: string): VerdictRead => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { ok: true, verdicts: {} }; // No verdicts yet: a true empty.
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, verdicts: {} };
    }
    const verdicts: Record<PostingId, Verdict> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const record = parseVerdict(value);
      if (!record) return { ok: false, verdicts: {} };
      // Tolerate keys written as filenames, as the ledger does.
      const postingId = postingIdFromFile(key);
      verdicts[postingId] = { postingId, ...record };
    }
    return { ok: true, verdicts };
  } catch {
    return { ok: false, verdicts: {} };
  }
};

export const fileVerdictStore = (path: string): VerdictStore => ({
  async read(): Promise<VerdictRead> {
    return read(path);
  },
  async save(verdict: Verdict): Promise<void> {
    const prior = read(path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, JSON.stringify(upsertVerdict(prior.verdicts, verdict), null, 2));
  },
});
