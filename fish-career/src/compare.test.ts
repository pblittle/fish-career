import { describe, expect, it } from 'vitest';
import { renderCalibration, spearman } from './compare.js';
import type { TriageRow } from './jev.js';

const row = (file: string, company: string, title: string, composite: number): TriageRow => ({
  file,
  title,
  company,
  composite,
  dims: {
    skills: { value: 0.8, confidence: 0.9 },
    level: { value: 0.7, confidence: 0.9 },
    location: { value: 1, confidence: 0.9 },
    comp: { value: 0.5, confidence: 0.3 },
    domain: { value: 0.9, confidence: 0.9 },
  },
  blocker: 0.1,
});

describe('spearman', () => {
  it('is 1 for identical orderings', () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('is -1 for reversed orderings', () => {
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });

  it('handles a single swap of adjacent ranks', () => {
    // d^2 = 1+1 = 2, n=3: 1 - 12/(3*8) = 0.5
    expect(spearman([1, 2, 3], [2, 1, 3])).toBeCloseTo(0.5);
  });

  it('averages tied ranks', () => {
    // [1,1,2] vs [1,2,3]: ties in a become ranks 1.5,1.5,3 -> d^2 = 0.25+0.25+0 = 0.5
    // rho = 1 - 3/(3*8) = 0.875
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeCloseTo(0.875);
  });

  it('is null below two items or on length mismatch', () => {
    expect(spearman([1], [1])).toBeNull();
    expect(spearman([], [])).toBeNull();
    expect(spearman([1, 2], [1, 2, 3])).toBeNull();
  });
});

describe('renderCalibration', () => {
  const rows = [row('b.txt', 'Beta', 'Role B', 0.8), row('a.txt', 'Alpha', 'Role A', 0.6)];

  it('reports rho and both rankings', () => {
    const out = renderCalibration(['b.txt', 'a.txt'], rows, 1);
    expect(out).toContain('Spearman rho: 1.00');
    expect(out).toMatch(/1\s+1\s+Beta: Role B/);
    expect(out).toMatch(/2\s+2\s+Alpha: Role A/);
  });

  it('names disagreements of two or more ranks with their dimension cells', () => {
    // Human: a first, b second. Jev (rows order): b first, a second. n=2, disagreement d=1 each, below threshold, so no section.
    const noSection = renderCalibration(['a.txt', 'b.txt'], rows, -1);
    expect(noSection).not.toContain('Biggest disagreements');

    const three = [
      row('c.txt', 'C', 'Role C', 0.9),
      row('b.txt', 'Beta', 'Role B', 0.8),
      row('a.txt', 'Alpha', 'Role A', 0.6),
    ];
    const out = renderCalibration(['a.txt', 'b.txt', 'c.txt'], three, 0.5);
    expect(out).toContain('Biggest disagreements');
    expect(out).toContain('skills 80% (conf 0.90)');
    expect(out).toContain('blocker 0.10');
  });

  it('skips files the rows do not contain', () => {
    const out = renderCalibration(['b.txt', 'missing.txt'], rows, null);
    expect(out).toContain('Beta: Role B');
    expect(out).not.toContain('missing.txt');
    expect(out).toContain('Spearman rho: n/a');
  });

  it('says so when nothing scored', () => {
    expect(renderCalibration([], [], null)).toBe('No postings were scored.');
  });
});
