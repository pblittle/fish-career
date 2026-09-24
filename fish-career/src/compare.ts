// Calibration comparison: the human ranking versus Jev's composite
// ordering, Spearman's rho between them, and the disagreements that
// carry the tuning signal. Every calibration run is persisted by the
// caller, because the accumulated record is the project's evidence
// about whether the rubric tracks a real person.

import type { TriageRow } from './jev.js';

const averageRanks = (values: number[]): number[] => {
  const indexed = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1][0] === indexed[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k][1]] = avg;
    i = j + 1;
  }
  return out;
};

export const spearman = (a: number[], b: number[]): number | null => {
  if (a.length !== b.length || a.length < 2) return null;
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const sumD2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * sumD2) / (a.length * (a.length * a.length - 1));
};

export interface CalibrationRecord {
  at: string;
  files: string[];
  humanRanking: string[];
  rho: number | null;
  rows: TriageRow[];
}

// Renders the comparison an agent reads back to the operator. The
// disagreement lines are the tuning loop: they name the dimension cells
// that drove Jev's side of each gap.
export const renderCalibration = (
  human: string[],
  rows: TriageRow[],
  rho: number | null,
): string => {
  if (rows.length === 0) return 'No postings were scored.';
  const jevOrder = rows.map((r) => r.file);
  const humanRank = (f: string) => human.indexOf(f) + 1;
  const jevRank = (f: string) => jevOrder.indexOf(f) + 1;

  const lines = [
    rho === null ? 'Spearman rho: n/a' : `Spearman rho: ${rho.toFixed(2)}`,
    '',
    'you  jev  posting',
  ];
  for (const f of human) {
    const row = rows.find((r) => r.file === f);
    if (!row) continue;
    lines.push(
      `${String(humanRank(f)).padStart(3)}   ${String(jevRank(f)).padStart(2)}  ${row.company}: ${row.title}`,
    );
  }

  const disagreements = human
    .filter((f) => rows.some((r) => r.file === f))
    .map((f) => ({ f, d: Math.abs(humanRank(f) - jevRank(f)) }))
    .filter((x) => x.d >= 2)
    .sort((a, b) => b.d - a.d)
    .slice(0, 3);
  if (disagreements.length > 0) {
    lines.push('', 'Biggest disagreements, with the dimensions that drove Jev:');
    for (const { f } of disagreements) {
      const row = rows.find((r) => r.file === f);
      if (!row) continue;
      const cells = Object.entries(row.dims)
        .map(([id, c]) => `${id} ${Math.round(c.value * 100)}% (conf ${c.confidence.toFixed(2)})`)
        .join(', ');
      lines.push(
        `  you ${humanRank(f)}, jev ${jevRank(f)}: ${row.company}: ${row.title} | ${cells} | blocker ${row.blocker.toFixed(2)}`,
      );
    }
  }

  lines.push(
    '',
    "Reading it: if Jev underrates what you value, raise that dimension's weight; if its confidence is low on a dimension, the profile line it reads is too vague. Adjust, then calibrate_rescore measures the same slice under the new rubric.",
  );
  return lines.join('\n');
};
