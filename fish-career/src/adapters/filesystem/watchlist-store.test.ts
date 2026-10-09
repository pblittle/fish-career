import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePaths } from './home.js';
import { fileWatchlistStore } from './watchlist-store.js';

const store = () => {
  const paths = homePaths(mkdtempSync(join(tmpdir(), 'fish-watchlist-')));
  return { paths, store: fileWatchlistStore(paths) };
};

const acme = { name: 'Acme', provider: 'ashby', slug: 'acme' };
const beta = { name: 'Beta', provider: 'greenhouse', slug: 'beta' };

describe('fileWatchlistStore.read', () => {
  it('is empty when no watchlist exists', async () => {
    expect(await store().store.read()).toEqual([]);
  });

  it('drops entries it cannot trust and keeps the rest', async () => {
    const { paths, store: s } = store();
    writeFileSync(paths.watchlist, JSON.stringify({ companies: [acme, { name: 'Typo' }, beta] }));
    expect(await s.read()).toEqual([acme, beta]);
  });

  it('reads an unparseable file as empty', async () => {
    const { paths, store: s } = store();
    writeFileSync(paths.watchlist, '{truncated');
    expect(await s.read()).toEqual([]);
  });
});

describe('fileWatchlistStore.write', () => {
  it('round-trips entries through a fresh file', async () => {
    const { store: s } = store();
    await s.write([acme]);
    await s.write([acme, beta]);
    expect(await s.read()).toEqual([acme, beta]);
  });

  it('refuses to write over a file holding a malformed entry, and leaves it untouched', async () => {
    const { paths, store: s } = store();
    const raw = JSON.stringify({ companies: [acme, { name: 'Typo', slug: 'typo' }] });
    writeFileSync(paths.watchlist, raw);
    await expect(s.write([acme, beta])).rejects.toThrow(/1 malformed entry/);
    expect(readFileSync(paths.watchlist, 'utf8')).toBe(raw);
  });

  it('refuses to write over a file it cannot parse', async () => {
    const { paths, store: s } = store();
    writeFileSync(paths.watchlist, '{truncated');
    await expect(s.write([acme])).rejects.toThrow(/could not be read/);
    expect(readFileSync(paths.watchlist, 'utf8')).toBe('{truncated');
  });
});
