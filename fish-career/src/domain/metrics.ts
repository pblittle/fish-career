// Rank-quality metrics. The predicted order is a list of posting IDs; the
// labels are graded relevance (0..3) authored by the operator. Every metric
// is null rather than a guess when its inputs are too thin: a half-labeled
// dataset should say so, not flatter itself.

import type { TriageRow } from './answers.js';
import type { PostingId } from './posting.js';
import { BLOCKER_FLAG } from './rubric.js';

export type Labels = Record<PostingId, number>;

const labelled = (predicted: PostingId[], labels: Labels): PostingId[] =>
  predicted.filter((id) => labels[id] !== undefined);

// Fraction of comparable labeled pairs the predicted order gets right. Pairs
// with equal labels are not comparable and are skipped; null when none exist.
export const pairwiseAccuracy = (predicted: PostingId[], labels: Labels): number | null => {
  const ids = labelled(predicted, labels);
  let comparable = 0;
  let correct = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      const la = labels[a];
      const lb = labels[b];
      if (la === undefined || lb === undefined || la === lb) continue;
      comparable += 1;
      if (la > lb) correct += 1;
    }
  }
  return comparable === 0 ? null : correct / comparable;
};

// Kendall's tau-b over the predicted order versus the label-derived order
// (higher label first). The array order is the prediction, so every pair is
// prediction-ordered; ties can only come from equal labels. Null below two
// items.
export const kendallTau = (predicted: PostingId[], labels: Labels): number | null => {
  const ids = labelled(predicted, labels);
  if (ids.length < 2) return null;
  let concordant = 0;
  let discordant = 0;
  let tiedLabel = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      const labelDiff = (labels[b] ?? 0) - (labels[a] ?? 0);
      if (labelDiff === 0) {
        tiedLabel += 1;
      } else if (labelDiff > 0) {
        // b is more relevant but a is predicted first.
        discordant += 1;
      } else {
        concordant += 1;
      }
    }
  }
  const pairs = concordant + discordant;
  const denominator = Math.sqrt(pairs * (pairs + tiedLabel));
  if (denominator === 0) return null;
  return (concordant - discordant) / denominator;
};

// Fraction of the top k the operator would call relevant (label >= 2).
export const precisionAtK = (predicted: PostingId[], labels: Labels, k: number): number | null => {
  if (k <= 0) return null;
  const top = predicted.slice(0, k);
  if (top.length === 0) return null;
  const relevant = top.filter((id) => (labels[id] ?? 0) >= 2).length;
  return relevant / k;
};

const dcg = (gains: number[]): number =>
  gains.reduce((sum, gain, i) => sum + (2 ** gain - 1) / Math.log2(i + 2), 0);

// Normalized discounted cumulative gain at k over graded relevance; 1 is the
// ideal ordering of the labeled set.
export const ndcgAtK = (predicted: PostingId[], labels: Labels, k: number): number | null => {
  if (k <= 0) return null;
  const ids = labelled(predicted, labels);
  if (ids.length === 0) return null;
  const gains = predicted
    .slice(0, k)
    .map((id) => (labels[id] !== undefined ? (labels[id] as number) : 0));
  const ideal = [...ids]
    .map((id) => labels[id] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idealDcg = dcg(ideal);
  return idealDcg === 0 ? null : dcg(gains) / idealDcg;
};

const effectiveWeights = (
  base: Record<string, number>,
  dimension: string,
  delta: number,
): Record<string, number> => {
  const bumped = { ...base };
  if (bumped[dimension] !== undefined) bumped[dimension] *= 1 + delta;
  const total = Object.values(bumped).reduce((sum, w) => sum + w, 0);
  return Object.fromEntries(Object.entries(bumped).map(([id, w]) => [id, w / total]));
};

export const compositeWithWeights = (row: TriageRow, weights: Record<string, number>): number =>
  Object.entries(row.dims).reduce((sum, [id, dim]) => sum + (weights[id] ?? 0) * dim.value, 0);

const orderWithWeights = (rows: TriageRow[], weights: Record<string, number>): PostingId[] =>
  [...rows]
    .sort(
      (a, b) =>
        Number(a.blocker >= BLOCKER_FLAG) - Number(b.blocker >= BLOCKER_FLAG) ||
        compositeWithWeights(b, weights) - compositeWithWeights(a, weights),
    )
    .map((r) => r.postingId);

export interface SensitivityReport {
  dimension: string;
  weight: number;
  perturbedWeight: number;
  topKOverlap: number;
  maxRankShift: number;
}

// How much the top of the table depends on one weight: bump it by delta,
// renormalize the others, rank again, and report the top-k overlap and the
// largest rank move. A ranking that survives a 20% weight change is telling
// the operator something different from one that reshuffles.
export const weightSensitivity = (
  rows: TriageRow[],
  weights: Record<string, number>,
  opts: { k?: number; delta?: number } = {},
): SensitivityReport[] => {
  const k = opts.k ?? 5;
  const delta = opts.delta ?? 0.2;
  const baseOrder = orderWithWeights(rows, weights);
  const baseTop = new Set(baseOrder.slice(0, k));
  return Object.keys(weights).map((dimension) => {
    const perturbed = effectiveWeights(weights, dimension, delta);
    const order = orderWithWeights(rows, perturbed);
    const overlap = order.slice(0, k).filter((id) => baseTop.has(id)).length;
    const maxRankShift = order.reduce((max, id) => {
      const shift = Math.abs(order.indexOf(id) - baseOrder.indexOf(id));
      return Math.max(max, shift);
    }, 0);
    return {
      dimension,
      weight: weights[dimension] ?? 0,
      perturbedWeight: perturbed[dimension] ?? 0,
      topKOverlap: k === 0 ? 0 : overlap / Math.min(k, order.length),
      maxRankShift,
    };
  });
};
