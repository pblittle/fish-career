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
// application refuses to record while read() is not ok, and save() refuses
// too, so a bypassing caller cannot clobber an unreadable store either.
const read = (path: string): VerdictRead => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    // Only a missing file is a true empty. A permission error, a directory
    // in the path, or any other failure is a store that may hold verdicts
    // and cannot be read; calling it empty would license a later write to
    // destroy them.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, verdicts: {} };
    return { ok: false, verdicts: {} };
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
    if (!prior.ok) {
      throw new Error(
        `The verdict store at ${path} could not be read; refusing to overwrite it. Fix or remove it first.`,
      );
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomic(path, JSON.stringify(upsertVerdict(prior.verdicts, verdict), null, 2));
  },
});
