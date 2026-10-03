import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePaths } from './home.js';
import { fileSkipTitlesStore } from './skip-titles-store.js';

const paths = () => homePaths(mkdtempSync(join(tmpdir(), 'fish-skip-titles-')));

describe('fileSkipTitlesStore.read', () => {
  it('skips nothing when the file does not exist', async () => {
    expect(await fileSkipTitlesStore(paths()).read()).toEqual([]);
  });

  it('reads the phrases, without comments or blank lines', async () => {
    const p = paths();
    writeFileSync(p.skipTitles, '# never scored\ndesigner\n\naccount executive\n');
    expect(await fileSkipTitlesStore(p).read()).toEqual(['designer', 'account executive']);
  });

  it('fails on a path it cannot read, rather than skipping nothing', async () => {
    const p = paths();
    mkdirSync(p.skipTitles);
    await expect(fileSkipTitlesStore(p).read()).rejects.toThrow();
  });
});
