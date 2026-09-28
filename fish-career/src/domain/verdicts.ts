// The verdict policy: the operator's own grade on an arrival, and the honest
// reporting of how the pipeline did against it. The grade scale is the eval
// dataset's, verbatim (fish-career/eval/labels.json): 3 act on it now, 2 worth
// a look, 1 a miss kept so the ranking can be measured against it, 0 should
// not surface. A blocker stays a separate demotion in triage; there is no
// "0 = blocked".
//
// A verdict is the human's ground truth at a time. It records which profile
// and rubric were current when the call was made, for reproducibility, and a
// later change to either NEVER invalidates it: the human outranks the
// machinery. Latest-wins: one verdict per posting, a re-grade replaces it,
// and no history is kept.
//
// The metric keeps metrics.ts's ethos: every number is null rather than a
// guess when its inputs are too thin. precision@arrival and its Wilson
// interval report "no read" below PRECISION_FLOOR.

import type { PostingId } from './posting.js';

export type Grade = 0 | 1 | 2 | 3;

export const GRADES: Record<Grade, string> = {
  3: 'act on it now',
  2: 'worth a look',
  1: 'a miss, kept so the ranking can be measured against it',
  0: 'should not surface',
};

export const isGrade = (value: unknown): value is Grade =>
  value === 0 || value === 1 || value === 2 || value === 3;

// What a stored verdict carries. The posting ID is the store key, so the
// value needs no copy of it; provenance rides every entry the way it does in
// the ledger, but here it explains a verdict rather than invalidating one.
export interface VerdictRecord {
  label: Grade;
  profileHash: string;
  rubric: number;
  at: string;
}

export interface Verdict extends VerdictRecord {
  postingId: PostingId;
}

export interface VerdictRead {
  ok: boolean;
  verdicts: Record<PostingId, Verdict>;
}

// Tolerant by design: only the label is required. A verdict missing its
// provenance is still the operator's judgment and is not thrown away.
export const parseVerdict = (value: unknown): VerdictRecord | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isGrade(v.label)) return null;
  return {
    label: v.label,
    profileHash: typeof v.profileHash === 'string' ? v.profileHash : '',
    rubric: typeof v.rubric === 'number' ? v.rubric : 0,
    at: typeof v.at === 'string' ? v.at : '',
  };
};

// Latest-wins, stated once so the adapters and tests agree on it.
export const upsertVerdict = (
  verdicts: Record<PostingId, Verdict>,
  verdict: Verdict,
): Record<PostingId, Verdict> => ({ ...verdicts, [verdict.postingId]: verdict });

export interface WilsonInterval {
  low: number;
  high: number;
}

// Wilson score interval for a binomial proportion, 95% by default. A normal
// approximation can dip below 0 or above 1 at small n; Wilson does not.
export const wilsonInterval = (successes: number, n: number, z = 1.96): WilsonInterval | null => {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
};

// Below this many graded arrivals, precision@arrival is not reported at all.
// 45 is an ESTIMATE from the advice run: enough graded arrivals that one
// grade cannot swing the rate by more than a few points. It is a code
// constant so the line is reviewable; raise it as the cache grows.
export const PRECISION_FLOOR = 45;

export interface ArrivalPrecision {
  n: number;
  relevant: number;
  value: number | null;
  wilson: WilsonInterval | null;
  floor: number;
  belowFloor: boolean;
}

// precision@arrival: of the arrivals the operator graded, the fraction they
// called worth a look or better (label >= 2). The denominator is graded
// arrivals, never the whole cache: an ungraded arrival is unknown, not a
// miss. Below the floor every number is null, matching metrics.ts.
export const precisionAtArrival = (
  arrivalIds: PostingId[],
  verdicts: Record<PostingId, Verdict>,
  opts: { floor?: number } = {},
): ArrivalPrecision => {
  const floor = opts.floor ?? PRECISION_FLOOR;
  const graded = arrivalIds.filter((id) => verdicts[id] !== undefined);
  const relevant = graded.filter((id) => (verdicts[id]?.label ?? 0) >= 2).length;
  const n = graded.length;
  const belowFloor = n < floor;
  return {
    n,
    relevant,
    value: belowFloor || n === 0 ? null : relevant / n,
    wilson: belowFloor ? null : wilsonInterval(relevant, n),
    floor,
    belowFloor,
  };
};

// Coverage: graded over cached. Null when the cache is empty (nothing to
// cover), never a 0/0 dressed as 0%.
export const coverage = (graded: number, cached: number): number | null =>
  cached <= 0 ? null : graded / cached;
