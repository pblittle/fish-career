import { describe, expect, it } from 'vitest';
import type { TriageRow } from './answers.js';
import {
  kendallTau,
  ndcgAtK,
  pairwiseAccuracy,
  precisionAtK,
  weightSensitivity,
} from './metrics.js';

const labels = { a: 3, b: 2, c: 1, d: 0 };

describe('pairwiseAccuracy', () => {
  it('is 1 for a perfect order and 0 for a reversed one', () => {
    expect(pairwiseAccuracy(['a', 'b', 'c', 'd'], labels)).toBe(1);
    expect(pairwiseAccuracy(['d', 'c', 'b', 'a'], labels)).toBe(0);
  });

  it('counts only comparable pairs: equal labels are skipped', () => {
    // b and c are both relevant; the a>b, a>c, b>d, c>d pairs are the judged ones.
    expect(pairwiseAccuracy(['a', 'b', 'd'], { a: 3, b: 2, c: 2, d: 0 })).toBe(1);
  });

  it('is null when nothing is comparable', () => {
    expect(pairwiseAccuracy(['a', 'b'], { a: 2, b: 2 })).toBeNull();
    expect(pairwiseAccuracy([], {})).toBeNull();
  });

  it('ignores predicted postings with no label', () => {
    expect(pairwiseAccuracy(['x', 'a', 'b'], { a: 3, b: 1 })).toBe(1);
  });
});

describe('kendallTau', () => {
  it('is 1 for the label order and -1 for its reverse', () => {
    expect(kendallTau(['a', 'b', 'c'], { a: 3, b: 2, c: 1 })).toBeCloseTo(1);
    expect(kendallTau(['c', 'b', 'a'], { a: 3, b: 2, c: 1 })).toBeCloseTo(-1);
  });

  it('handles tied labels with the tau-b denominator', () => {
    // Pairs: (a,b) concordant, (a,c) concordant, (b,c) tied label.
    // (2 - 0) / sqrt(2 * (2 + 1)) = 2 / sqrt(6)
    expect(kendallTau(['a', 'b', 'c'], { a: 2, b: 1, c: 1 })).toBeCloseTo(2 / Math.sqrt(6));
  });

  it('is null below two labeled items', () => {
    expect(kendallTau(['a'], { a: 3 })).toBeNull();
  });
});

describe('precisionAtK and ndcgAtK', () => {
  it('precision counts labels of 2 or better in the top k', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], labels, 2)).toBe(1);
    expect(precisionAtK(['a', 'c', 'd', 'b'], labels, 2)).toBe(0.5);
    expect(precisionAtK(['a', 'b'], labels, 0)).toBeNull();
  });

  it('ndcg is 1 for the ideal order and lower when relevant rows sink', () => {
    expect(ndcgAtK(['a', 'b', 'c', 'd'], labels, 4)).toBeCloseTo(1);
    const worse = ndcgAtK(['d', 'c', 'b', 'a'], labels, 4);
    expect(worse).not.toBeNull();
    expect(worse as number).toBeLessThan(1);
    expect(worse as number).toBeGreaterThan(0);
  });

  it('treats an unlabeled posting in the top k as gain zero', () => {
    const withUnknown = ndcgAtK(['x', 'a', 'b'], { a: 3, b: 2 }, 3);
    const ideal = ndcgAtK(['a', 'b'], { a: 3, b: 2 }, 2);
    expect(withUnknown).toBeLessThan(ideal as number);
  });
});

const row = (postingId: string, skills: number, domain: number): TriageRow => ({
  postingId,
  title: postingId,
  company: 'Acme',
  composite: 0,
  dims: { skills: { value: skills, confidence: 0.9 }, domain: { value: domain, confidence: 0.9 } },
  blocker: 0,
});

describe('weightSensitivity', () => {
  const rows = [row('a', 0.2, 1.0), row('b', 1.0, 0.2)];

  it('shows a top-1 reshuffle when the decisive weight moves', () => {
    const [skills] = weightSensitivity(rows, { skills: 0.5, domain: 0.5 }, { k: 1, delta: 0.2 });
    expect(skills?.dimension).toBe('skills');
    expect(skills?.topKOverlap).toBe(0);
    expect(skills?.maxRankShift).toBe(1);
  });

  it('shows stability when the other weight moves', () => {
    const reports = weightSensitivity(rows, { skills: 0.5, domain: 0.5 }, { k: 1, delta: 0.2 });
    const domain = reports.find((r) => r.dimension === 'domain');
    expect(domain?.topKOverlap).toBe(1);
    expect(domain?.maxRankShift).toBe(0);
  });

  it('keeps blockers demoted whatever the weights do', () => {
    const blocked = [...rows, { ...row('blocked', 1, 1), blocker: 0.9 }];
    for (const report of weightSensitivity(blocked, { skills: 0.5, domain: 0.5 }, { k: 3 })) {
      expect(report.maxRankShift).toBeLessThanOrEqual(2);
    }
    const [skills] = weightSensitivity(blocked, { skills: 0.5, domain: 0.5 }, { k: 3, delta: 0.2 });
    expect(skills?.topKOverlap).toBeGreaterThan(0);
  });
});
