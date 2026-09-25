import { describe, expect, it } from 'vitest';
import { composite, type JevAnswers } from './answers.js';
import { DIMENSIONS, profileHash, stateFor } from './rubric.js';

const answers = (scores: Record<string, number>, blocker = 0, confidence = 0.9): JevAnswers => ({
  hard_blocker: { noul: blocker },
  ...Object.fromEntries(Object.keys(scores).map((id) => [id, { score: scores[id], confidence }])),
});

describe('DIMENSIONS', () => {
  it('weights sum to 1', () => {
    const sum = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('gives every dimension a 4-point criteria ladder', () => {
    for (const d of DIMENSIONS) expect(d.criteria).toHaveLength(4);
  });
});

describe('composite', () => {
  it('is 1 when every dimension scores its top criterion', () => {
    const all = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 3]));
    expect(composite(answers(all))).toBeCloseTo(1);
  });

  it('is 0 when every dimension scores its bottom criterion', () => {
    const none = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0]));
    expect(composite(answers(none))).toBeCloseTo(0);
  });

  it('applies the weights: skills dominates comp', () => {
    // skills=3 (0.35 * 1.0) vs comp=3 (0.10 * 1.0), everything else 0.
    expect(composite(answers({ skills: 3 }))).toBeCloseTo(0.35);
    expect(composite(answers({ comp: 3 }))).toBeCloseTo(0.1);
  });

  it('treats a missing score as the bottom criterion', () => {
    expect(composite(answers({}))).toBeCloseTo(0);
  });

  it('never emits NaN for malformed judge output', () => {
    const malformed = {
      hard_blocker: { noul: Number.NaN },
      skills: { score: 'three', confidence: Number.NaN },
      level: { score: Number.POSITIVE_INFINITY },
      location: { score: -5, confidence: 2 },
      comp: null,
      domain: undefined,
    } as unknown as JevAnswers;
    const c = composite(malformed);
    expect(Number.isFinite(c)).toBe(true);
    expect(c).toBeCloseTo(0); // -5 clamps to 0; everything malformed reads 0
  });
});

describe('stateFor', () => {
  it('labels both documents so the model cannot confuse them', () => {
    const s = stateFor('PROFILE TEXT', 'POSTING TEXT');
    expect(s).toBe('CANDIDATE PROFILE:\nPROFILE TEXT\n\nJOB POSTING:\nPOSTING TEXT');
  });
});

describe('profileHash', () => {
  it('is stable for the same profile and rubric', () => {
    expect(profileHash('same')).toBe(profileHash('same'));
  });

  it('changes when the profile text changes', () => {
    expect(profileHash('one')).not.toBe(profileHash('two'));
  });
});
