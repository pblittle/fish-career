import { postingIdFromFile } from '../../domain/posting.js';
import type { Preference } from '../../domain/preferences.js';
import type { PreferencesStore } from '../../ports/stores.js';
import { type HomePaths, readJson } from './home.js';

const isPreference = (v: unknown): v is Preference => {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.better === 'string' && typeof p.worse === 'string' && typeof p.source === 'string'
  );
};

// Preferences files written before stable IDs name filenames; normalize to
// posting IDs at the boundary so the use case speaks one vocabulary.
export const filePreferencesStore = (paths: HomePaths): PreferencesStore => ({
  async read(): Promise<Preference[]> {
    const parsed = readJson<{ preferences?: unknown }>(paths.preferences, {});
    if (!Array.isArray(parsed.preferences)) return [];
    return parsed.preferences.filter(isPreference).map((p) => ({
      better: postingIdFromFile(p.better),
      worse: postingIdFromFile(p.worse),
      source: p.source,
    }));
  },
});
