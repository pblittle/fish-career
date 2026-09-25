import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePreferences, type Preference, renderEval } from './evaluate.js';
import { composite, type JevAnswers, rankRows, type TriageRow } from './jev.js';
import { rowFromAnswers } from './triage.js';

const row = (
  file: string,
  company: string,
  composite: number,
  over: Partial<TriageRow> = {},
): TriageRow => ({
  file,
  title: 'Role',
  company,
  composite,
  dims: {},
  blocker: 0,
  ...over,
});

const pref = (better: string, worse: string): Preference => ({
  better,
  worse,
  source: 'test: the operator said so',
});

describe('evaluatePreferences', () => {
  it('is satisfied when every better file ranks above its worse file', () => {
    const rows = [row('a.txt', 'A', 0.9), row('b.txt', 'B', 0.6)];
    const out = evaluatePreferences(rows, [pref('a.txt', 'b.txt')]);
    expect(out).toMatchObject({ satisfied: 1, total: 1, violations: [] });
  });

  it('reports a violation, with both ranks, when the order is inverted', () => {
    const rows = [row('b.txt', 'B', 0.9), row('a.txt', 'A', 0.6)];
    const out = evaluatePreferences(rows, [pref('a.txt', 'b.txt')]);
    expect(out.satisfied).toBe(0);
    expect(out.total).toBe(1);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]?.betterRank).toBe(2);
    expect(out.violations[0]?.worseRank).toBe(1);
  });

  it('skips a constraint whose files were not scored, and says so in the total', () => {
    const rows = [row('a.txt', 'A', 0.9)];
    const out = evaluatePreferences(rows, [pref('a.txt', 'missing.txt')]);
    expect(out.total).toBe(0);
  });

  it('ranks by the same rule the table does: a blocker demotes regardless of composite', () => {
    const rows = [
      row('blocked.txt', 'Blocked', 0.95, { blocker: 0.9 }),
      row('clean.txt', 'Clean', 0.7),
    ];
    const out = evaluatePreferences(rows, [pref('clean.txt', 'blocked.txt')]);
    expect(out.satisfied).toBe(1);
  });
});

describe('renderEval', () => {
  it('states the score and names each violation with its source', () => {
    const rows = [row('b.txt', 'B', 0.9), row('a.txt', 'A', 0.6)];
    const out = renderEval(evaluatePreferences(rows, [pref('a.txt', 'b.txt')]));
    expect(out).toContain('0/1');
    expect(out).toContain('the operator said so');
  });
});

describe('the recorded eval slice (golden inputs, no network)', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/eval-slice.json', import.meta.url), 'utf8'),
  ) as { entries: { file: string; answers: JevAnswers }[] };
  const prefs = JSON.parse(
    readFileSync(new URL('./fixtures/eval-preferences.json', import.meta.url), 'utf8'),
  ) as { preferences: Preference[] };

  it('the current rubric satisfies every operator-revealed preference', () => {
    const rows = fixture.entries.map((e) =>
      rowFromAnswers(e.file, e.answers, {
        title: e.file,
        company: e.file.split('-')[0] ?? e.file,
      }),
    );
    const out = evaluatePreferences(rows, prefs.preferences);
    expect(out.total).toBeGreaterThan(0);
    expect(out.violations, JSON.stringify(out.violations, null, 2)).toEqual([]);
  });

  it('composite and ranking still place the LangChain architect seat first', () => {
    const rows = rankRows(
      fixture.entries.map((e) =>
        rowFromAnswers(e.file, e.answers, {
          title: e.file,
          company: e.file.split('-')[0] ?? e.file,
        }),
      ),
    );
    expect(rows[0]?.file).toContain('langchain');
    const [first] = fixture.entries;
    expect(first ? composite(first.answers) : 0).toBeGreaterThan(0.5);
  });
});
