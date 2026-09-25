// The ranking-quality report: how well a scored run agrees with the
// operator's graded labels, where the top of the table is fragile, and which
// postings are missing an answer. Built to be compared run over run.

import type { TriageRow } from './answers.js';
import { spearman } from './calibration.js';
import {
  kendallTau,
  type Labels,
  ndcgAtK,
  pairwiseAccuracy,
  precisionAtK,
  type SensitivityReport,
  weightSensitivity,
} from './metrics.js';
import type { PostingId } from './posting.js';
import { rankRows } from './ranking.js';
import { BLOCKER_FLAG, DIMENSIONS } from './rubric.js';

export interface QualityEntry {
  postingId: PostingId;
  title: string;
  company: string;
  label: number;
  rank: number;
  composite: number;
  blocker: number;
  missing: boolean;
}

export interface QualityReport {
  labeled: number;
  scored: number;
  missing: PostingId[];
  pairwiseAccuracy: number | null;
  kendallTau: number | null;
  spearman: number | null;
  precisionAtK: number | null;
  ndcgAtK: number | null;
  k: number;
  blockersBelowClean: boolean;
  sensitivity: SensitivityReport[];
  ranked: QualityEntry[];
}

export const qualityReport = (
  rows: TriageRow[],
  labels: Labels,
  opts: { k?: number; delta?: number } = {},
): QualityReport => {
  const k = opts.k ?? 5;
  const rankedRows = rankRows(rows);
  const predicted = rankedRows.map((r) => r.postingId);
  const position = new Map(predicted.map((id, i) => [id, i]));

  const entries: QualityEntry[] = Object.entries(labels)
    .map(([postingId, label]) => {
      const row = rankedRows.find((r) => r.postingId === postingId);
      return {
        postingId,
        title: row?.title ?? '',
        company: row?.company ?? '',
        label,
        rank: position.has(postingId) ? (position.get(postingId) ?? 0) + 1 : 0,
        composite: row?.composite ?? 0,
        blocker: row?.blocker ?? 0,
        missing: row === undefined,
      };
    })
    .sort((a, b) => {
      const ra = a.rank === 0 ? Number.POSITIVE_INFINITY : a.rank;
      const rb = b.rank === 0 ? Number.POSITIVE_INFINITY : b.rank;
      return ra - rb || b.label - a.label;
    });

  const labeledIds = predicted.filter((id) => labels[id] !== undefined);
  const weights = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.weight]));
  const firstBlocker = rankedRows.findIndex((r) => r.blocker >= BLOCKER_FLAG);
  const blockersBelowClean =
    firstBlocker === -1 || rankedRows.slice(firstBlocker).every((r) => r.blocker >= BLOCKER_FLAG);

  return {
    labeled: Object.keys(labels).length,
    scored: rows.length,
    missing: entries.filter((e) => e.missing).map((e) => e.postingId),
    pairwiseAccuracy: pairwiseAccuracy(predicted, labels),
    kendallTau: kendallTau(predicted, labels),
    spearman:
      labeledIds.length >= 2
        ? spearman(
            labeledIds.map((id) => labels[id] as number),
            labeledIds.map((_, i) => -i),
          )
        : null,
    precisionAtK: precisionAtK(predicted, labels, k),
    ndcgAtK: ndcgAtK(predicted, labels, k),
    k,
    blockersBelowClean,
    sensitivity: weightSensitivity(rankedRows, weights, {
      k,
      ...(opts.delta !== undefined ? { delta: opts.delta } : {}),
    }),
    ranked: entries,
  };
};

const pct = (value: number | null): string =>
  value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

const bar = (value: number, width = 16): string => {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return `${'#'.repeat(filled)}${'.'.repeat(width - filled)}`;
};

export const renderQualityReport = (report: QualityReport): string => {
  const lines = [
    `ranking quality against ${report.labeled} labeled postings (${report.scored} scored, k=${report.k})`,
    '',
    `pairwise accuracy  ${pct(report.pairwiseAccuracy)}  ${bar(report.pairwiseAccuracy ?? 0)}`,
    `kendall tau        ${pct(report.kendallTau)}  ${bar(((report.kendallTau ?? 0) + 1) / 2)}`,
    `spearman rho       ${pct(report.spearman)}  ${bar(((report.spearman ?? 0) + 1) / 2)}`,
    `precision@${report.k}       ${pct(report.precisionAtK)}  ${bar(report.precisionAtK ?? 0)}`,
    `ndcg@${report.k}            ${pct(report.ndcgAtK)}  ${bar(report.ndcgAtK ?? 0)}`,
    `blockers below clean rows: ${report.blockersBelowClean ? 'yes' : 'NO'}`,
    ...(report.missing.length > 0 ? [`labeled but unscored: ${report.missing.join(', ')}`] : []),
    '',
    'rank  label  match  blocker  posting',
  ];
  for (const entry of report.ranked) {
    const rank = entry.missing ? ' -' : String(entry.rank).padStart(3);
    const match = entry.missing ? ' n/a' : `${Math.round(entry.composite * 100)}%`;
    lines.push(
      `${rank}   ${entry.label}      ${match.padStart(5)}  ${entry.blocker.toFixed(2)}    ${entry.company}: ${entry.title} (${entry.postingId})`,
    );
  }
  lines.push('', `weight sensitivity, top-${report.k} overlap and max rank shift per dimension:`);
  for (const s of report.sensitivity) {
    lines.push(
      `  ${s.dimension.padEnd(9)} ${(s.weight * 100).toFixed(0)}% -> ${(s.perturbedWeight * 100).toFixed(0)}%   overlap ${(s.topKOverlap * 100).toFixed(0)}%   max shift ${s.maxRankShift}`,
    );
  }
  lines.push(
    '',
    `reading it: label 3 is a posting to act on now, 1 is a miss, 0 is a fit the ranking should not surface. A "match" that is low with a high label is a rubric problem; a high match with a low label is a profile problem.`,
  );
  return lines.join('\n');
};
