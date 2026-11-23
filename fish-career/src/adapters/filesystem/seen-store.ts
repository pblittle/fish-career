import { readFileSync } from 'node:fs';
import type { SeenEntry, SeenRead, SeenStore } from '../../ports/stores.js';
import { type HomePaths, writeJson } from './home.js';

// A corrupt seen index is REPORTED, not silently treated as empty: an
// unnoticed reset re-arrives every posting the operator already graded and
// loses the record of why anything was dropped. The verdict store sets the
// pattern; this is the same one. Only a missing file is a true empty.
const read = (path: string): SeenRead => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, seen: {} };
    return { ok: false, seen: {} };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, seen: {} };
    }
    const seen: Record<string, SeenEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null) return { ok: false, seen: {} };
      seen[key] = value as SeenEntry;
    }
    return { ok: true, seen };
  } catch {
    return { ok: false, seen: {} };
  }
};

export const fileSeenStore = (paths: HomePaths): SeenStore => ({
  async read(): Promise<SeenRead> {
    return read(paths.seen);
  },
  async write(seen: Record<string, SeenEntry>): Promise<void> {
    writeJson(paths.seen, seen);
  },
});
