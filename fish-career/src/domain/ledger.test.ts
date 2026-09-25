import { describe, expect, it } from 'vitest';
import { parseEntry, stale, unscored } from './ledger.js';

const CURRENT = { profileHash: 'abc123def456', rubric: 1 };

describe('parseEntry', () => {
  it('amnesties a legacy numeric entry: scored, provenance unknown', () => {
    expect(parseEntry(0.5)).toEqual({ score: 0.5, profileHash: null, rubric: null });
  });

  it('rejects an entry whose score is not a finite number', () => {
    expect(parseEntry({ score: 'high' })).toBeNull();
    expect(parseEntry({ score: Number.NaN })).toBeNull();
    expect(parseEntry(null)).toBeNull();
  });

  it('keeps a timestamp when one is present', () => {
    expect(parseEntry({ score: 0.5, at: '2026-09-25T00:00:00.000Z' })).toMatchObject({
      score: 0.5,
      at: '2026-09-25T00:00:00.000Z',
    });
  });
});

describe('unscored', () => {
  it('filters out entries scored under the current profile and rubric', () => {
    const entries = { a: { score: 0.5, profileHash: 'abc123def456', rubric: 1 } };
    expect(unscored(['a', 'b'], entries, CURRENT)).toEqual(['b']);
  });

  it('treats an entry under a different profile hash as stale, not scored', () => {
    const entries = { a: { score: 0.5, profileHash: 'old000000000', rubric: 1 } };
    expect(unscored(['a'], entries, CURRENT)).toEqual(['a']);
  });

  it('treats an entry under an older rubric version as stale', () => {
    const entries = { a: { score: 0.5, profileHash: 'abc123def456', rubric: 0 } };
    expect(unscored(['a'], entries, CURRENT)).toEqual(['a']);
  });

  it('trusts legacy entries once: unknown provenance is not stale', () => {
    const entries = { a: { score: 0.5, profileHash: null, rubric: null } };
    expect(unscored(['a'], entries, CURRENT)).toEqual([]);
  });
});

describe('stale', () => {
  it('names only entries whose provenance no longer matches', () => {
    const entries = {
      a: { score: 0.5, profileHash: 'abc123def456', rubric: 1 },
      b: { score: 0.5, profileHash: 'old000000000', rubric: 1 },
      c: { score: 0.5, profileHash: null, rubric: null },
      d: { score: 0.5, profileHash: 'abc123def456', rubric: 0 },
    };
    expect(stale(['a', 'b', 'c', 'd'], entries, CURRENT)).toEqual(['b', 'd']);
  });
});
