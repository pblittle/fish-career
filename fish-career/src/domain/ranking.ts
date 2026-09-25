// Ranking policy: what order the rows appear in, and how the table reads.
// Blocker demotion comes before composite; region-labelled variants of one
// vacancy collapse to one row.

import type { TriageRow } from './answers.js';
import { BLOCKER_FLAG, LOW_CONFIDENCE } from './rubric.js';

// A posting naming a hard requirement the candidate cannot meet is not the
// best row in the table no matter its scores. Sorting by composite alone left
// 0.86-blocker rows above clean fits and leaned on a footnote to explain it.
export const rankRows = (rows: TriageRow[]): TriageRow[] =>
  [...rows].sort(
    (a, b) =>
      Number(a.blocker >= BLOCKER_FLAG) - Number(b.blocker >= BLOCKER_FLAG) ||
      b.composite - a.composite,
  );

// Boards post one remote role once per office ("(Remote)", "(Dallas)",
// "(Austin)"), and three top rows for one vacancy is a table that lies about
// choice. The highest row stands; the others keep their office labels.
//
// Only region-labelled titles collapse. A bare base title ("Deployed
// Engineer, Professional Services") stays its own row even when a suffixed
// title shares its base: the two may be genuinely different postings (the
// APAC variant of that role is a different job), and hiding a distinct role
// is worse than showing a possible duplicate.
export const roleKey = (title: string): string =>
  title
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();

const regionLabelled = (title: string): boolean => /\([^)]*\)\s*$/.test(title);

export const collapseVariants = (rows: TriageRow[]): TriageRow[] => {
  const groups = new Map<string, TriageRow[]>();
  for (const r of rankRows(rows)) {
    const key = `${r.company.toLowerCase()}::${roleKey(r.title)}${regionLabelled(r.title) ? '' : '::bare'}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((group) => {
    const [primary, ...rest] = group;
    return rest.length === 0
      ? primary
      : {
          ...primary,
          variants: rest.map((r) => r.title.match(/\(([^)]*)\)\s*$/)?.[1] ?? r.title),
        };
  });
};

// Renders the ranked result as text a host shows the operator. Deliberately
// the same table the CLI prints, so both surfaces read identically.
export const renderTable = (rows: TriageRow[]): string => {
  const header =
    'rank  posting                                        match  skills  level  loc    comp   domain  blocker';
  const lines = rows.map((r, i) => {
    const cell = (id: string) => {
      const c = r.dims[id];
      const flag = c !== undefined && c.confidence < LOW_CONFIDENCE ? '?' : ' ';
      return `${Math.round((c?.value ?? 0) * 100)}%${flag}`;
    };
    const label = `${r.company}: ${r.title}`.slice(0, 46).padEnd(48);
    return ` ${(i + 1).toString().padStart(2)}  ${label} ${Math.round(r.composite * 100)}%   ${cell('skills')}  ${cell('level')}  ${cell('location')}  ${cell('comp')}  ${cell('domain')}  ${r.blocker.toFixed(2)}${r.blocker >= BLOCKER_FLAG ? '  <- check this one' : ''}`;
  });
  const notes = [
    `A "?" marks a dimension answered at confidence below ${LOW_CONFIDENCE}: read that posting yourself.`,
    `A blocker at ${BLOCKER_FLAG} or above is a likely hard requirement not met, regardless of match.`,
  ];
  for (const r of rows) {
    if (r.variants && r.variants.length > 0) {
      notes.push(
        `${r.company}: ${r.title} is one vacancy; also posted at ${r.variants.join(', ')}.`,
      );
    }
  }
  return [header, ...lines, '', ...notes].join('\n');
};
