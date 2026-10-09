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

interface Loaded {
  entries: WatchlistEntry[];
  // The file exists but is not a watchlist: unparseable, or `companies` is
  // not an array. Distinct from a missing file, which is a true empty.
  unreadable: boolean;
  // Entries present in the file that isEntry rejected.
  dropped: number;
}

// The watchlist is hand-edited as often as fish writes it, so a malformed
// entry is a typo to fix, not data to discard. read() drops what it cannot
// trust so a poll still runs over the valid entries; write() refuses while
// anything would be dropped, so an add or remove never deletes the
// operator's own line behind their back.
const load = (path: string): Loaded => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: [], unreadable: false, dropped: 0 };
    }
    return { entries: [], unreadable: true, dropped: 0 };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const companies =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { companies?: unknown }).companies
        : undefined;
    if (!Array.isArray(companies)) return { entries: [], unreadable: true, dropped: 0 };
    const entries = companies.filter(isEntry);
    return { entries, unreadable: false, dropped: companies.length - entries.length };
  } catch {
    return { entries: [], unreadable: true, dropped: 0 };
  }
};

export const fileWatchlistStore = (paths: HomePaths): WatchlistStore => ({
  async read(): Promise<WatchlistEntry[]> {
    return load(paths.watchlist).entries;
  },
  async write(entries: WatchlistEntry[]): Promise<void> {
    const prior = load(paths.watchlist);
    if (prior.unreadable) {
      throw new Error(
        `The watchlist at ${paths.watchlist} could not be read; refusing to write over it. Fix the file first.`,
      );
    }
    if (prior.dropped > 0) {
      const noun = prior.dropped === 1 ? 'entry' : 'entries';
      throw new Error(
        `The watchlist at ${paths.watchlist} has ${prior.dropped} malformed ${noun}; refusing to write over the file. Fix it first.`,
      );
    }
    writeFileSync(paths.watchlist, JSON.stringify({ companies: entries }, null, 2));
  },
});
