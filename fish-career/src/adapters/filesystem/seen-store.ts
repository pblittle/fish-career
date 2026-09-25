import type { SeenEntry, SeenStore } from '../../ports/stores.js';
import { type HomePaths, readJson, writeJson } from './home.js';

export const fileSeenStore = (paths: HomePaths): SeenStore => ({
  async read(): Promise<Record<string, SeenEntry>> {
    const raw = readJson<Record<string, unknown>>(paths.seen, {});
    const out: Record<string, SeenEntry> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        out[key] = value as SeenEntry;
      }
    }
    return out;
  },
  async write(seen: Record<string, SeenEntry>): Promise<void> {
    writeJson(paths.seen, seen);
  },
});
