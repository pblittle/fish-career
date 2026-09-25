// Pairwise preferences measured against the current ranking, each carrying
// the profile line it came from. Spearman over a hand-ranked slice (the
// calibrate use cases) is the gold standard when an operator will rank one;
// these constraints are what the operator ALREADY said, written down, so the
// rubric can be held to its own evidence on every run.

import type { TriageRow } from './answers.js';
import { rankRows } from './ranking.js';

export interface Preference {
  better: string;
  worse: string;
  source: string;
}

export interface PreferenceViolation {
  preference: Preference;
  betterRank: number;
  worseRank: number;
  betterRow: TriageRow;
}

export interface EvalOutcome {
  satisfied: number;
  total: number;
  violations: PreferenceViolation[];
}

// A preference is judged only when both postings were scored in this run; the
// rest are not silently counted as passes or failures.
export const evaluatePreferences = (rows: TriageRow[], prefs: Preference[]): EvalOutcome => {
  const order = rankRows(rows);
  const rank = new Map(order.map((r, i) => [r.postingId, i]));
  const violations: PreferenceViolation[] = [];
  let satisfied = 0;
  for (const preference of prefs) {
    const better = rank.get(preference.better);
    const worse = rank.get(preference.worse);
    const betterRow = better === undefined ? undefined : order[better];
    if (better === undefined || worse === undefined || betterRow === undefined) continue;
    if (better < worse) {
      satisfied += 1;
      continue;
    }
    violations.push({
      preference,
      betterRank: better + 1,
      worseRank: worse + 1,
      betterRow,
    });
  }
  return { satisfied, total: satisfied + violations.length, violations };
};

export const renderEval = (outcome: EvalOutcome): string => {
  const lines = [`operator-revealed preferences: ${outcome.satisfied}/${outcome.total} satisfied`];
  for (const v of outcome.violations) {
    lines.push(
      '',
      `VIOLATED: ${v.betterRow.company}: ${v.betterRow.title} ranks ${v.betterRank}, below ${v.preference.worse} at ${v.worseRank}`,
      `  source: ${v.preference.source}`,
    );
  }
  if (outcome.total === 0) {
    lines.push('', 'No preference could be judged: its files are not in this run.');
  }
  return lines.join('\n');
};
