import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Verdict } from '../../domain/verdicts.js';
import { fileVerdictStore } from './verdicts.js';

const home = () => mkdtempSync(join(tmpdir(), 'fish-verdicts-'));
const verdict = (postingId: string, label: Verdict['label']): Verdict => ({
  postingId,
  label,
  profileHash: 'abc123def456',
  rubric: 1,
  at: '2026-09-27T12:00:00.000Z',
});

describe('fileVerdictStore.read', () => {
  it('is empty when no store exists', async () => {
    expect(await fileVerdictStore(join(home(), 'verdicts.json')).read()).toEqual({
      ok: true,
      verdicts: {},
    });
  });

  it('reads verdicts with their provenance', async () => {
    const p = join(home(), 'verdicts.json');
    await fileVerdictStore(p).save(verdict('acme-1', 2));
    const r = await fileVerdictStore(p).read();
    expect(r.ok).toBe(true);
    expect(r.verdicts['acme-1']).toEqual({
      postingId: 'acme-1',
      label: 2,
      profileHash: 'abc123def456',
      rubric: 1,
      at: '2026-09-27T12:00:00.000Z',
    });
  });

  it('normalizes legacy filename keys to stable posting IDs', async () => {
    const p = join(home(), 'verdicts.json');
    writeFileSync(p, JSON.stringify({ 'acme-123.txt': { label: 3 } }, null, 2));
    const r = await fileVerdictStore(p).read();
    expect(r.verdicts['acme-123']?.label).toBe(3);
  });

  it('keeps a verdict that is missing provenance: the judgment outranks it', async () => {
    const p = join(home(), 'verdicts.json');
    writeFileSync(p, JSON.stringify({ a: { label: 1 } }, null, 2));
    const r = await fileVerdictStore(p).read();
    expect(r.ok).toBe(true);
    expect(r.verdicts.a?.label).toBe(1);
    expect(r.verdicts.a?.profileHash).toBe('');
  });

  it('reports corruption instead of silently starting over', async () => {
    const p = join(home(), 'verdicts.json');
    writeFileSync(p, '{truncated');
    const r = await fileVerdictStore(p).read();
    expect(r.ok).toBe(false);
    expect(r.verdicts).toEqual({});
  });

  it('reports a present-but-unreadable path instead of calling it empty', async () => {
    // A directory where the store file should be: readFileSync fails with
    // EISDIR, not ENOENT, so the store exists but cannot be read and must
    // not be mistaken for a fresh empty.
    const r = await fileVerdictStore(home()).read();
    expect(r.ok).toBe(false);
    expect(r.verdicts).toEqual({});
  });

  it('rejects entries whose label is not a grade', async () => {
    const p = join(home(), 'verdicts.json');
    writeFileSync(p, JSON.stringify({ a: { label: 7 } }));
    expect((await fileVerdictStore(p).read()).ok).toBe(false);
  });
});

describe('fileVerdictStore.save', () => {
  it('is latest-wins: a re-grade replaces the posting and keeps the rest', async () => {
    const p = join(home(), 'verdicts.json');
    const store = fileVerdictStore(p);
    await store.save(verdict('a', 3));
    await store.save(verdict('b', 1));
    await store.save({ ...verdict('a', 0), at: '2026-09-28T00:00:00.000Z' });
    const r = await store.read();
    expect(Object.keys(r.verdicts).sort()).toEqual(['a', 'b']);
    expect(r.verdicts.a?.label).toBe(0);
    expect(r.verdicts.a?.at).toBe('2026-09-28T00:00:00.000Z');
    expect(r.verdicts.b?.label).toBe(1);
  });

  it('creates the parent directory when missing', async () => {
    const p = join(home(), 'nested', 'verdicts.json');
    await fileVerdictStore(p).save(verdict('a', 2));
    expect((await fileVerdictStore(p).read()).verdicts.a?.label).toBe(2);
  });

  it('refuses to save over a corrupt store and leaves it byte-identical', async () => {
    const p = join(home(), 'verdicts.json');
    writeFileSync(p, '{truncated');
    const before = readFileSync(p);
    await expect(fileVerdictStore(p).save(verdict('a', 2))).rejects.toThrow(
      'refusing to overwrite',
    );
    expect(readFileSync(p)).toEqual(before);
  });

  it('leaves no temp file behind', async () => {
    const dir = home();
    const p = join(dir, 'verdicts.json');
    await fileVerdictStore(p).save(verdict('a', 2));
    const leftovers = readdirSync(dir).filter((f) => f !== 'verdicts.json');
    expect(leftovers).toEqual([]);
  });
});
