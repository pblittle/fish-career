import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markScored, readLedger, stale, unscored } from './ledger.js';

const home = () => mkdtempSync(join(tmpdir(), 'fish-ledger-'));
const CURRENT = { profileHash: 'abc123def456', rubric: 1 };

describe('readLedger', () => {
  it('is empty when no ledger exists', () => {
    expect(readLedger(join(home(), 'scored.json'))).toEqual({ ok: true, entries: {} });
  });

  it('reads object entries with their provenance', () => {
    const p = join(home(), 'scored.json');
    markScored(p, { 'a.txt': 0.5 }, CURRENT);
    const r = readLedger(p);
    expect(r.ok).toBe(true);
    expect(r.entries['a.txt']).toMatchObject({
      score: 0.5,
      profileHash: 'abc123def456',
      rubric: 1,
    });
  });

  it('amnesties legacy numeric entries: scored, with unknown provenance', () => {
    const p = join(home(), 'scored.json');
    writeLegacy(p, { 'a.txt': 0.5 });
    const r = readLedger(p);
    expect(r.ok).toBe(true);
    expect(r.entries['a.txt']).toEqual({ score: 0.5, profileHash: null, rubric: null });
  });

  it('reports corruption instead of silently starting over', () => {
    const p = join(home(), 'scored.json');
    writeFileSync(p, '{truncated');
    expect(readLedger(p).ok).toBe(false);
    expect(readLedger(p).entries).toEqual({});
  });

  it('rejects entries whose score is not a number', () => {
    const p = join(home(), 'scored.json');
    writeFileSync(p, JSON.stringify({ 'a.txt': { score: 'high' } }));
    expect(readLedger(p).ok).toBe(false);
  });
});

describe('unscored', () => {
  it('filters out entries scored under the current profile and rubric', () => {
    const entries = { 'a.txt': { score: 0.5, profileHash: 'abc123def456', rubric: 1 } };
    expect(unscored(['a.txt', 'b.txt'], entries, CURRENT)).toEqual(['b.txt']);
  });

  it('treats an entry under a different profile hash as stale, not scored', () => {
    const entries = { 'a.txt': { score: 0.5, profileHash: 'old000000000', rubric: 1 } };
    expect(unscored(['a.txt'], entries, CURRENT)).toEqual(['a.txt']);
  });

  it('treats an entry under an older rubric version as stale', () => {
    const entries = { 'a.txt': { score: 0.5, profileHash: 'abc123def456', rubric: 0 } };
    expect(unscored(['a.txt'], entries, CURRENT)).toEqual(['a.txt']);
  });

  it('trusts legacy entries once: unknown provenance is not stale', () => {
    const entries = { 'a.txt': { score: 0.5, profileHash: null, rubric: null } };
    expect(unscored(['a.txt'], entries, CURRENT)).toEqual([]);
  });
});

describe('stale', () => {
  it('names only entries whose provenance no longer matches', () => {
    const entries = {
      'a.txt': { score: 0.5, profileHash: 'abc123def456', rubric: 1 },
      'b.txt': { score: 0.5, profileHash: 'old000000000', rubric: 1 },
      'c.txt': { score: 0.5, profileHash: null, rubric: null },
      'd.txt': { score: 0.5, profileHash: 'abc123def456', rubric: 0 },
    };
    expect(stale(['a.txt', 'b.txt', 'c.txt', 'd.txt'], entries, CURRENT)).toEqual([
      'b.txt',
      'd.txt',
    ]);
  });
});

describe('markScored', () => {
  it('merges new scores over prior ones', () => {
    const p = join(home(), 'scored.json');
    markScored(p, { 'a.txt': 0.5 }, CURRENT);
    markScored(p, { 'a.txt': 0.7, 'b.txt': 0.3 }, CURRENT);
    const r = readLedger(p);
    expect(r.entries['a.txt']?.score).toBe(0.7);
    expect(r.entries['b.txt']?.score).toBe(0.3);
  });

  it('rounds scores to three decimals and records provenance', () => {
    const p = join(home(), 'scored.json');
    markScored(p, { 'a.txt': 0.123456789 }, CURRENT);
    const e = readLedger(p).entries['a.txt'];
    expect(e?.score).toBe(0.123);
    expect(e?.profileHash).toBe('abc123def456');
    expect(e?.rubric).toBe(1);
    expect(typeof e?.at).toBe('string');
  });

  it('creates the parent directory when missing', () => {
    const p = join(home(), 'nested', 'scored.json');
    markScored(p, { 'a.txt': 0.1 }, CURRENT);
    expect(readLedger(p).entries['a.txt']?.score).toBe(0.1);
  });
});

function writeLegacy(path: string, entries: Record<string, number>): void {
  writeFileSync(path, JSON.stringify(entries, null, 2));
}
