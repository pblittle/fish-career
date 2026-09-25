import { readFileSync, writeFileSync } from 'node:fs';
import type { WatchlistEntry, WatchlistStore } from '../../ports/stores.js';
import type { HomePaths } from './home.js';

const isEntry = (v: unknown): v is WatchlistEntry => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    typeof e.provider === 'string' &&
    typeof e.slug === 'string' &&
    e.name.trim().length > 0
  );
};

export const fileWatchlistStore = (paths: HomePaths): WatchlistStore => ({
  async read(): Promise<WatchlistEntry[]> {
    try {
      const parsed = JSON.parse(readFileSync(paths.watchlist, 'utf8')) as { companies?: unknown };
      if (!Array.isArray(parsed.companies)) return [];
      return parsed.companies.filter(isEntry);
    } catch {
      return [];
    }
  },
  async write(entries: WatchlistEntry[]): Promise<void> {
    writeFileSync(paths.watchlist, JSON.stringify({ companies: entries }, null, 2));
  },
});
