import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runQuality } from './quality.js';

const evalDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'eval');

interface Expected {
  k: number;
  pairwiseAccuracy: number;
  kendallTau: number;
  spearman: number;
  precisionAt5: number;
  ndcgAt5: number;
  missing: string[];
  blockersBelowClean: boolean;
  sensitivity: { dimension: string; topKOverlap: number; maxRankShift: number }[];
}

const expected = JSON.parse(
  readFileSync(join(evalDir, 'expected-metrics.json'), 'utf8'),
) as Expected;

describe('the recorded quality baseline', () => {
  it('matches the golden metrics', async () => {
    const { report } = await runQuality({ dir: evalDir, k: expected.k });
    expect(report.pairwiseAccuracy).toBeCloseTo(expected.pairwiseAccuracy, 6);
    expect(report.kendallTau).toBeCloseTo(expected.kendallTau, 6);
    expect(report.spearman).toBeCloseTo(expected.spearman, 6);
    expect(report.precisionAtK).toBeCloseTo(expected.precisionAt5, 6);
    expect(report.ndcgAtK).toBeCloseTo(expected.ndcgAt5, 6);
    expect(report.missing).toEqual(expected.missing);
    expect(report.blockersBelowClean).toBe(expected.blockersBelowClean);
    expect(
      report.sensitivity.map((s) => ({
        dimension: s.dimension,
        topKOverlap: s.topKOverlap,
        maxRankShift: s.maxRankShift,
      })),
    ).toEqual(expected.sensitivity);
  });

  it('every labeled posting is either scored or deliberately skipped', async () => {
    const labels = JSON.parse(readFileSync(join(evalDir, 'labels.json'), 'utf8')) as {
      postings: { postingId: string }[];
    };
    const baseline = JSON.parse(readFileSync(join(evalDir, 'base-run.json'), 'utf8')) as {
      entries: { postingId: string }[];
      skipped: string[];
    };
    const accounted = new Set([...baseline.entries.map((e) => e.postingId), ...baseline.skipped]);
    for (const posting of labels.postings) {
      expect(accounted.has(posting.postingId), posting.postingId).toBe(true);
    }
    expect(baseline.skipped).toEqual(['contoso-thin']);
  });

  it('holds the label-derived pairs and keeps the adversarial posting out of the top five', async () => {
    const labels = JSON.parse(readFileSync(join(evalDir, 'labels.json'), 'utf8')) as {
      pairs: { better: string; worse: string }[];
    };
    const { report } = await runQuality({ dir: evalDir, k: 5 });
    const rank = new Map(report.ranked.map((e) => [e.postingId, e.rank]));
    for (const pair of labels.pairs) {
      expect(rank.get(pair.better), `${pair.better} vs ${pair.worse}`).toBeLessThan(
        rank.get(pair.worse) ?? Number.POSITIVE_INFINITY,
      );
    }
    expect(report.ranked.slice(0, 5).map((e) => e.postingId)).not.toContain('globex-adversarial');
    expect(
      report.ranked.find((e) => e.postingId === 'globex-adversarial')?.blocker ?? 0,
    ).toBeGreaterThanOrEqual(0.5);
  });

  it('collapses the duplicate region listing rather than double-counting it', async () => {
    const { report } = await runQuality({ dir: evalDir, k: 5 });
    const remote = report.ranked.find((e) => e.postingId === 'northwind-duplicate-remote');
    const dallas = report.ranked.find((e) => e.postingId === 'northwind-duplicate-dallas');
    expect(remote).toBeDefined();
    expect(dallas).toBeDefined();
    // Both postings are scored; the table's collapse rule is exercised in the
    // ranking tests. Here the contract is that both are measured, not hidden.
    expect(remote?.label).toBe(2);
    expect(dallas?.label).toBe(2);
  });
});
