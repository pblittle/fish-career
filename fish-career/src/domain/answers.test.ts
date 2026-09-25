import { describe, expect, it } from 'vitest';
import { rowFromAnswers } from './answers.js';

describe('rowFromAnswers', () => {
  it('clamps malformed judge output instead of emitting NaN', () => {
    const row = rowFromAnswers(
      'x',
      {
        hard_blocker: { noul: 2 },
        skills: { score: Number.NaN, confidence: 3 },
        level: { score: 'nine' },
        location: { score: -1, confidence: -1 },
        comp: {},
        domain: { score: 2, confidence: 0.5 },
      } as never,
      { title: 'T', company: 'C' },
    );
    expect(row.blocker).toBe(1);
    expect(row.dims.skills?.value).toBe(0);
    expect(row.dims.skills?.confidence).toBe(1);
    expect(row.dims.location?.value).toBe(0);
    expect(row.dims.location?.confidence).toBe(0);
    expect(row.dims.domain?.value).toBeCloseTo(2 / 3);
    expect(row.dims.domain?.confidence).toBe(0.5);
  });

  it('carries the stable posting ID, not a filename', () => {
    const row = rowFromAnswers(
      'acme-123',
      { hard_blocker: { noul: 0 } },
      { title: 'T', company: 'C' },
    );
    expect(row.postingId).toBe('acme-123');
  });
});
