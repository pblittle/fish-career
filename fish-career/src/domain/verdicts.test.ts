import { describe, expect, it } from 'vitest';
import {
  coverage,
  isGrade,
  PRECISION_FLOOR,
  parseVerdict,
  precisionAtArrival,
  upsertVerdict,
  type Verdict,
  wilsonInterval,
} from './verdicts.js';

const verdict = (postingId: string, label: Verdict['label']): Verdict => ({
  postingId,
  label,
  profileHash: 'abc123def456',
  rubric: 1,
  at: '2026-09-27T12:00:00.000Z',
});

describe('the grade scale', () => {
  it('is 0..3 and nothing else', () => {
    for (const value of [0, 1, 2, 3]) expect(isGrade(value)).toBe(true);
    for (const value of [-1, 4, 1.5, '2', null, undefined, Number.NaN]) {
      expect(isGrade(value)).toBe(false);
    }
  });
});

describe('parseVerdict', () => {
  it('reads a full record', () => {
    expect(
      parseVerdict({ label: 2, profileHash: 'abc', rubric: 1, at: '2026-09-27T00:00:00.000Z' }),
    ).toEqual({ label: 2, profileHash: 'abc', rubric: 1, at: '2026-09-27T00:00:00.000Z' });
  });

  it('keeps a verdict whose provenance is missing: the judgment outranks it', () => {
    expect(parseVerdict({ label: 3 })).toEqual({
      label: 3,
      profileHash: '',
      rubric: 0,
      at: '',
    });
  });

  it('rejects a record with no usable label', () => {
    expect(parseVerdict({ profileHash: 'abc' })).toBeNull();
    expect(parseVerdict({ label: 4 })).toBeNull();
    expect(parseVerdict({ label: '3' })).toBeNull();
    expect(parseVerdict(null)).toBeNull();
    expect(parseVerdict([1])).toBeNull();
  });
});

describe('latest-wins', () => {
  it('replaces the earlier verdict for the posting and leaves others alone', () => {
    const before = { a: verdict('a', 3), b: verdict('b', 1) };
    const after = upsertVerdict(before, { ...verdict('a', 0), at: '2026-09-28T00:00:00.000Z' });
    expect(after.a?.label).toBe(0);
    expect(after.a?.at).toBe('2026-09-28T00:00:00.000Z');
    expect(after.b).toEqual(before.b);
    expect(Object.keys(after)).toHaveLength(2);
  });
});

describe('wilsonInterval', () => {
  it('brackets the observed rate and stays inside [0, 1]', () => {
    const interval = wilsonInterval(30, 45);
    expect(interval?.low).toBeCloseTo(0.5207, 4);
    expect(interval?.high).toBeCloseTo(0.7864, 4);
    expect(wilsonInterval(45, 45)).toEqual({ low: expect.closeTo(0.9213, 4), high: 1 });
    expect(wilsonInterval(0, 45)?.low).toBe(0);
  });

  it('is null with nothing to measure', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe('precisionAtArrival', () => {
  const arrivals = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const verdicts = (labels: Record<string, Verdict['label']>): Record<string, Verdict> =>
    Object.fromEntries(Object.entries(labels).map(([id, label]) => [id, verdict(id, label)]));

  it('counts label >= 2 over graded arrivals only', () => {
    const all = verdicts(Object.fromEntries(arrivals.map((id, i) => [id, i < 30 ? 2 : 1])));
    const p = precisionAtArrival(arrivals, all);
    expect(p.n).toBe(60);
    expect(p.relevant).toBe(30);
    expect(p.value).toBe(0.5);
    expect(p.belowFloor).toBe(false);
  });

  it('does not count an ungraded arrival against the rate', () => {
    const graded = verdicts({ p0: 3, p1: 3, p2: 0 });
    const p = precisionAtArrival(arrivals, graded);
    expect(p.n).toBe(3);
    expect(p.relevant).toBe(2);
    // Below the floor the numbers are withheld rather than reported thin.
    expect(p.value).toBeNull();
    expect(p.wilson).toBeNull();
    expect(p.belowFloor).toBe(true);
    expect(p.floor).toBe(PRECISION_FLOOR);
  });

  it('reports exactly at the floor, not below it', () => {
    const graded = verdicts(
      Object.fromEntries(arrivals.slice(0, PRECISION_FLOOR).map((id) => [id, 2 as const])),
    );
    const p = precisionAtArrival(arrivals, graded);
    expect(p.n).toBe(PRECISION_FLOOR);
    expect(p.belowFloor).toBe(false);
    expect(p.value).toBe(1);
    expect(p.wilson?.low).toBeLessThan(1);
  });

  it('ignores a verdict for a posting no longer in the cache', () => {
    const graded = { ...verdicts({ p0: 3 }), gone: verdict('gone', 3) };
    const p = precisionAtArrival(['p0'], graded);
    expect(p.n).toBe(1);
    expect(p.relevant).toBe(1);
  });

  it('honors an explicit floor and never divides by zero', () => {
    const graded = verdicts({ p0: 3, p1: 1 });
    const p = precisionAtArrival(arrivals, graded, { floor: 2 });
    expect(p.value).toBe(0.5);
    const none = precisionAtArrival([], {}, { floor: 0 });
    expect(none.value).toBeNull();
    expect(none.wilson).toBeNull();
  });
});

describe('coverage', () => {
  it('is graded over cached, and null when the cache is empty', () => {
    expect(coverage(3, 10)).toBe(0.3);
    expect(coverage(0, 10)).toBe(0);
    expect(coverage(0, 0)).toBeNull();
  });
});
