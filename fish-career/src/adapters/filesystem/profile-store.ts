import { readFileSync, writeFileSync } from 'node:fs';
import type { ProfileStore } from '../../ports/stores.js';
import type { HomePaths } from './home.js';

export const fileProfileStore = (paths: HomePaths): ProfileStore => ({
  async read(): Promise<string> {
    try {
      return readFileSync(paths.profile, 'utf8');
    } catch {
      return '';
    }
  },
  async write(content: string): Promise<void> {
    writeFileSync(paths.profile, content);
  },
});
