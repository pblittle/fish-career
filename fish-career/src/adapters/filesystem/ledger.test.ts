import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileLedger } from './ledger.js';

const home = () => mkdtempSync(join(tmpdir(), 'fish-ledger-'));
const CURRENT = { profileHash: 'abc123def456', rubric: 1 };

describe('fileLedger.read', () => {
  it('is empty when no ledger exists', async () => {
    expect(await fileLedger(join(home(), 'scored.json')).read()).toEqual({ ok: true, entries: {} });
  });

  it('reads object entries with their provenance', async () => {
    const p = join(home(), 'scored.json');
    const ledger = fileLedger(p);
    await ledger.mark({ a: 0.5 }, CURRENT);
    const r = await ledger.read();
    expect(r.ok).toBe(true);
    expect(r.entries.a).toMatchObject({
      score: 0.5,
      profileHash: 'abc123def456',
      rubric: 1,
    });
  });

  it('amnesties legacy numeric entries: scored, with unknown provenance', async () => {
    const p = join(home(), 'scored.json');
    writeFileSync(p, JSON.stringify({ 'a.txt': 0.5 }, null, 2));
    const r = await fileLedger(p).read();
    expect(r.ok).toBe(true);
    expect(r.entries.a).toEqual({ score: 0.5, profileHash: null, rubric: null });
  });

  it('normalizes legacy filename keys to stable posting IDs', async () => {
    const p = join(home(), 'scored.json');
    writeFileSync(
      p,
      JSON.stringify(
        { 'acme-123.txt': { score: 0.5, profileHash: 'abc123def456', rubric: 1 } },
        null,
        2,
      ),
    );
    const r = await fileLedger(p).read();
    expect(r.entries['acme-123']?.score).toBe(0.5);
  });

  it('reports corruption instead of silently starting over', async () => {
    const p = join(home(), 'scored.json');
    writeFileSync(p, '{truncated');
    const r = await fileLedger(p).read();
    expect(r.ok).toBe(false);
    expect(r.entries).toEqual({});
  });

  it('rejects entries whose score is not a number', async () => {
    const p = join(home(), 'scored.json');
    writeFileSync(p, JSON.stringify({ 'a.txt': { score: 'high' } }));
    expect((await fileLedger(p).read()).ok).toBe(false);
  });
});

describe('fileLedger.mark', () => {
  it('merges new scores over prior ones', async () => {
    const p = join(home(), 'scored.json');
    const ledger = fileLedger(p);
    await ledger.mark({ a: 0.5 }, CURRENT);
    await ledger.mark({ a: 0.7, b: 0.3 }, CURRENT);
    const r = await ledger.read();
    expect(r.entries.a?.score).toBe(0.7);
    expect(r.entries.b?.score).toBe(0.3);
  });

  it('rounds scores to three decimals and records provenance', async () => {
    const p = join(home(), 'scored.json');
    const ledger = fileLedger(p);
    await ledger.mark({ a: 0.123456789 }, CURRENT);
    const e = (await ledger.read()).entries.a;
    expect(e?.score).toBe(0.123);
    expect(e?.profileHash).toBe('abc123def456');
    expect(e?.rubric).toBe(1);
    expect(typeof e?.at).toBe('string');
  });

  it('creates the parent directory when missing', async () => {
    const p = join(home(), 'nested', 'scored.json');
    await fileLedger(p).mark({ a: 0.1 }, CURRENT);
    expect((await fileLedger(p).read()).entries.a?.score).toBe(0.1);
  });

  it('leaves no temp file behind', async () => {
    const dir = home();
    const p = join(dir, 'scored.json');
    await fileLedger(p).mark({ a: 0.5 }, CURRENT);
    const leftovers = readdirSync(dir).filter((f) => f !== 'scored.json');
    expect(leftovers).toEqual([]);
  });
});
