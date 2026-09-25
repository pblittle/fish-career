import { describe, expect, it } from 'vitest';
import type { TriageRow } from './answers.js';
import { collapseVariants, rankRows, renderTable } from './ranking.js';

const tableRow = (
  postingId: string,
  composite: number,
  blocker = 0,
  over: Partial<TriageRow> = {},
): TriageRow => ({
  postingId,
  title: `Role ${postingId}`,
  company: 'Acme',
  composite,
  dims: {},
  blocker,
  ...over,
});

describe('rankRows', () => {
  it('sorts clean rows by composite, best first', () => {
    const rows = rankRows([tableRow('low', 0.4), tableRow('high', 0.9)]);
    expect(rows.map((r) => r.postingId)).toEqual(['high', 'low']);
  });

  it('demotes a blocker row below clean rows however high its composite', () => {
    const rows = rankRows([tableRow('blocked', 0.99, 0.8), tableRow('clean', 0.5)]);
    expect(rows.map((r) => r.postingId)).toEqual(['clean', 'blocked']);
  });

  it('sorts within the blocker class by composite', () => {
    const rows = rankRows([tableRow('bad-low', 0.3, 0.6), tableRow('bad-high', 0.8, 0.6)]);
    expect(rows.map((r) => r.postingId)).toEqual(['bad-high', 'bad-low']);
  });
});

describe('collapseVariants', () => {
  it('collapses one vacancy posted per office into one row naming the others', () => {
    const rows = collapseVariants([
      tableRow('la', 0.9, 0, { title: 'Deployed Architect (Remote)' }),
      tableRow('dal', 0.8, 0, { title: 'Deployed Architect (Dallas)' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variants).toEqual(['Dallas']);
  });

  it('keeps distinct roles and distinct companies apart', () => {
    const rows = collapseVariants([
      tableRow('a', 0.9, 0, { title: 'Architect (Remote)' }),
      tableRow('b', 0.8, 0, { title: 'Engineer (Remote)' }),
      tableRow('c', 0.7, 0, { title: 'Architect (Remote)', company: 'Other' }),
    ]);
    expect(rows).toHaveLength(3);
  });

  it('keeps a bare base title separate from its region-labelled variants', () => {
    const rows = collapseVariants([
      tableRow('atl', 0.8, 0, { title: 'Deployed Engineer, Professional Services' }),
      tableRow('apac', 0.6, 0, { title: 'Deployed Engineer, Professional Services (APAC)' }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe('renderTable', () => {
  const row: TriageRow = {
    postingId: 'acme-1',
    title: 'Platform Lead',
    company: 'Acme',
    composite: 0.812,
    dims: {
      skills: { value: 0.66, confidence: 0.4 },
      level: { value: 1, confidence: 0.9 },
      location: { value: 1, confidence: 0.9 },
      comp: { value: 0.5, confidence: 0.9 },
      domain: { value: 0.75, confidence: 0.9 },
    },
    blocker: 0.55,
  };

  it('flags low confidence with ? and high blockers with a check line', () => {
    const out = renderTable([row]);
    expect(out).toContain('66%?');
    expect(out).toContain('100% ');
    expect(out).toContain('0.55  <- check this one');
    expect(out).toContain('81%');
  });
});
