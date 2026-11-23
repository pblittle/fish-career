import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePaths } from './home.js';
import { fileSeenStore } from './seen-store.js';

const paths = () => homePaths(mkdtempSync(join(tmpdir(), 'fish-seen-')));

// seen.json lives under state/, which a bare temp home does not have.
const writeSeen = (p: ReturnType<typeof paths>, raw: string): void => {
  mkdirSync(p.state, { recursive: true });
  writeFileSync(p.seen, raw);
};

// A corrupt seen index is REPORTED, not reset: an unnoticed empty would
// re-arrive every posting and lose the drop reasons. Only a missing file
// is a true empty.
describe('fileSeenStore.read', () => {
  it('is a true empty when the file does not exist', async () => {
    const read = await fileSeenStore(paths()).read();
    expect(read.ok).toBe(true);
    expect(read.seen).toEqual({});
  });

  it('reads the index', async () => {
    const p = paths();
    writeSeen(
      p,
      JSON.stringify({ 'gh:acme:1': { title: 'Engineer', file: 'acme-1.txt', observedAt: 'x' } }),
    );
    const read = await fileSeenStore(p).read();
    expect(read.ok).toBe(true);
    expect(read.seen['gh:acme:1']?.file).toBe('acme-1.txt');
  });

  it('reports a file that does not parse, rather than resetting it', async () => {
    const p = paths();
    writeSeen(p, '{"gh:acme:1": "unbalanced');
    expect((await fileSeenStore(p).read()).ok).toBe(false);
  });

  it('reports a file that is not an index', async () => {
    const p = paths();
    writeSeen(p, '[{"title": "Engineer"}]');
    expect((await fileSeenStore(p).read()).ok).toBe(false);
  });

  it('reports an index with a malformed entry rather than trusting the rest', async () => {
    const p = paths();
    writeSeen(p, '{"gh:acme:1": {"title": "A"}, "gh:acme:2": "not an entry"}');
    expect((await fileSeenStore(p).read()).ok).toBe(false);
  });

  it('round-trips a write', async () => {
    const store = fileSeenStore(paths());
    await store.write({ 'gh:acme:1': { title: 'Engineer', dropped: 'thin-text' } });
    const read = await store.read();
    expect(read.ok).toBe(true);
    expect(read.seen['gh:acme:1']?.dropped).toBe('thin-text');
  });
});
