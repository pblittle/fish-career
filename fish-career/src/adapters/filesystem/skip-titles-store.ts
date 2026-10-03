import { readFileSync } from 'node:fs';
import { parseSkipTitles } from '../../domain/skip-titles.js';
import type { SkipTitlesStore } from '../../ports/stores.js';
import type { HomePaths } from './home.js';

// A missing file skips nothing. Any other read failure is thrown: a skip list
// that silently reads as empty would let every title it names through.
export const fileSkipTitlesStore = (paths: HomePaths): SkipTitlesStore => ({
  async read(): Promise<string[]> {
    try {
      return parseSkipTitles(readFileSync(paths.skipTitles, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  },
});
