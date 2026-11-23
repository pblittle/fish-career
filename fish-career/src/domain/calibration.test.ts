import { describe, expect, it } from 'vitest';
import type { TriageRow } from './answers.js';
import { renderCalibration, spearman } from './calibration.js';

const row = (postingId: string, company: string, title: string, score: number): TriageRow => ({
  postingId,
  title,
  company,
  composite: score,
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
    // [1,1,2] vs [1,2,3]: ties in a become ranks 1.5,1.5,3, and Pearson
    // over the averaged ranks is 1.5/sqrt(1.5*2) ≈ 0.866. The 6Σd²
    // shortcut would answer 0.875; it is exact only without ties.
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeCloseTo(0.8660254037844386);
  });

  it('is exact with ties on both sides', () => {
    // A perfect reversal of tied pairs is -1; the 6Σd² shortcut answers -0.6.
    expect(spearman([1, 1, 2, 2], [2, 2, 1, 1])).toBeCloseTo(-1);
    // Uneven ties: Pearson is 3.75/4.5 ≈ 0.833; the shortcut answers 0.85.
    expect(spearman([1, 1, 2, 3], [1, 2, 2, 3])).toBeCloseTo(0.8333333333333334);
  });

  it('is null when one side is constant', () => {
    // No variance on one side: there is no association to measure.
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('is null below two items or on length mismatch', () => {
    expect(spearman([1], [1])).toBeNull();
    expect(spearman([], [])).toBeNull();
    expect(spearman([1, 2], [1, 2, 3])).toBeNull();
  });
});

describe('renderCalibration', () => {
  const rows = [row('b', 'Beta', 'Role B', 0.8), row('a', 'Alpha', 'Role A', 0.6)];

  it('reports rho and both rankings', () => {
    const out = renderCalibration(['b', 'a'], rows, 1);
    expect(out).toContain('Spearman rho: 1.00');
    expect(out).toMatch(/1\s+1\s+Beta: Role B/);
    expect(out).toMatch(/2\s+2\s+Alpha: Role A/);
  });

  it('names disagreements of two or more ranks with their dimension cells', () => {
    // Human: a first, b second. Judge (rows order): b first, a second. n=2,
    // disagreement d=1 each, below threshold, so no section.
    const noSection = renderCalibration(['a', 'b'], rows, -1);
    expect(noSection).not.toContain('Biggest disagreements');

    const three = [
      row('c', 'C', 'Role C', 0.9),
      row('b', 'Beta', 'Role B', 0.8),
      row('a', 'Alpha', 'Role A', 0.6),
    ];
    const out = renderCalibration(['a', 'b', 'c'], three, 0.5);
    expect(out).toContain('Biggest disagreements');
    expect(out).toContain('skills 80% (conf 0.90)');
    expect(out).toContain('blocker 0.10');
  });

  it('skips postings the rows do not contain', () => {
    const out = renderCalibration(['b', 'missing'], rows, null);
    expect(out).toContain('Beta: Role B');
    expect(out).not.toContain('missing');
    expect(out).toContain('Spearman rho: n/a');
  });

  it('says so when nothing scored', () => {
    expect(renderCalibration([], [], null)).toBe('No postings were scored.');
  });
});
