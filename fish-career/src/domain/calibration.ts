// Calibration comparison: the human ranking versus the judge's composite
// ordering, Spearman's rho between them, and the disagreements that carry the
// tuning signal. Every calibration run is persisted by the caller, because
// the accumulated record is the project's evidence about whether the rubric
// tracks a real person.

import type { TriageRow } from './answers.js';
import type { PostingId } from './posting.js';

const averageRanks = (values: number[]): number[] => {
  const indexed = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]?.[0] === indexed[i]?.[0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const at = indexed[k]?.[1];
      if (at !== undefined) out[at] = avg;
    }
    i = j + 1;
  }
  return out;
};

export const spearman = (a: number[], b: number[]): number | null => {
  if (a.length !== b.length || a.length < 2) return null;
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const sumD2 = ra.reduce((s, r, i) => s + (r - (rb[i] ?? 0)) ** 2, 0);
  return 1 - (6 * sumD2) / (a.length * (a.length * a.length - 1));
};

export interface CalibrationRecord {
  at: string;
  postingIds: PostingId[];
  humanRanking: PostingId[];
  rho: number | null;
  rows: TriageRow[];
}

// Renders the comparison an agent reads back to the operator. The
// disagreement lines are the tuning loop: they name the dimension cells that
// drove the judge's side of each gap.
export const renderCalibration = (
  human: PostingId[],
  rows: TriageRow[],
  rho: number | null,
): string => {
  if (rows.length === 0) return 'No postings were scored.';
  const judgeOrder = rows.map((r) => r.postingId);
  const humanRank = (id: PostingId) => human.indexOf(id) + 1;
  const judgeRank = (id: PostingId) => judgeOrder.indexOf(id) + 1;

  const lines = [
    rho === null ? 'Spearman rho: n/a' : `Spearman rho: ${rho.toFixed(2)}`,
    '',
    'you  jev  posting',
  ];
  for (const id of human) {
    const row = rows.find((r) => r.postingId === id);
    if (!row) continue;
    lines.push(
      `${String(humanRank(id)).padStart(3)}   ${String(judgeRank(id)).padStart(2)}  ${row.company}: ${row.title}`,
    );
  }

  const disagreements = human
    .filter((id) => rows.some((r) => r.postingId === id))
    .map((id) => ({ id, d: Math.abs(humanRank(id) - judgeRank(id)) }))
    .filter((x) => x.d >= 2)
    .sort((a, b) => b.d - a.d)
    .slice(0, 3);
  if (disagreements.length > 0) {
    lines.push('', 'Biggest disagreements, with the dimensions that drove the judge:');
    for (const { id } of disagreements) {
      const row = rows.find((r) => r.postingId === id);
      if (!row) continue;
      const cells = Object.entries(row.dims)
        .map(
          ([dimId, c]) =>
            `${dimId} ${Math.round(c.value * 100)}% (conf ${c.confidence.toFixed(2)})`,
        )
        .join(', ');
      lines.push(
        `  you ${humanRank(id)}, jev ${judgeRank(id)}: ${row.company}: ${row.title} | ${cells} | blocker ${row.blocker.toFixed(2)}`,
      );
    }
  }

  lines.push(
    '',
    "Reading it: if the judge underrates what you value, raise that dimension's weight; if its confidence is low on a dimension, the profile line it reads is too vague. Adjust, then re-measure the same slice under the new rubric.",
  );
  return lines.join('\n');
};
