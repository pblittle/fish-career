import { describe, expect, it } from 'vitest';
import {
  callJev,
  collapseVariants,
  composite,
  DIMENSIONS,
  type JevAnswers,
  profileHash,
  rankRows,
  renderTable,
  stateFor,
  type TriageRow,
} from './jev.js';

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

const tableRow = (
  file: string,
  composite: number,
  blocker = 0,
  over: Partial<TriageRow> = {},
): TriageRow => ({
  file,
  title: `Role ${file}`,
  company: 'Acme',
  composite,
  dims: {},
  blocker,
  ...over,
});

describe('rankRows', () => {
  it('sorts clean rows by composite, best first', () => {
    const rows = rankRows([tableRow('low.txt', 0.4), tableRow('high.txt', 0.9)]);
    expect(rows.map((r) => r.file)).toEqual(['high.txt', 'low.txt']);
  });

  it('demotes a blocker row below clean rows however high its composite', () => {
    const rows = rankRows([tableRow('blocked.txt', 0.99, 0.8), tableRow('clean.txt', 0.5)]);
    expect(rows.map((r) => r.file)).toEqual(['clean.txt', 'blocked.txt']);
  });

  it('sorts within the blocker class by composite', () => {
    const rows = rankRows([tableRow('bad-low.txt', 0.3, 0.6), tableRow('bad-high.txt', 0.8, 0.6)]);
    expect(rows.map((r) => r.file)).toEqual(['bad-high.txt', 'bad-low.txt']);
  });
});

describe('collapseVariants', () => {
  it('collapses one vacancy posted per office into one row naming the others', () => {
    const rows = collapseVariants([
      tableRow('la.txt', 0.9, 0, { title: 'Deployed Architect (Remote)' }),
      tableRow('dal.txt', 0.8, 0, { title: 'Deployed Architect (Dallas)' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variants).toEqual(['Dallas']);
  });

  it('keeps distinct roles and distinct companies apart', () => {
    const rows = collapseVariants([
      tableRow('a.txt', 0.9, 0, { title: 'Architect (Remote)' }),
      tableRow('b.txt', 0.8, 0, { title: 'Engineer (Remote)' }),
      tableRow('c.txt', 0.7, 0, { title: 'Architect (Remote)', company: 'Other' }),
    ]);
    expect(rows).toHaveLength(3);
  });

  it('keeps a bare base title separate from its region-labelled variants', () => {
    const rows = collapseVariants([
      tableRow('atl.txt', 0.8, 0, { title: 'Deployed Engineer, Professional Services' }),
      tableRow('apac.txt', 0.6, 0, { title: 'Deployed Engineer, Professional Services (APAC)' }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe('callJev', () => {
  const answers = { hard_blocker: { noul: 0 }, skills: { score: 3, confidence: 0.9 } };
  const resp = (status: number) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ answers, usage: { input_tokens: 7, output_tokens: 3 } }),
      text: async () => `status ${status}`,
    }) as unknown as Awaited<ReturnType<typeof fetch>>;

  it('returns answers, usage and latency on success', async () => {
    const call = await callJev('state', {
      fetchImpl: (async () => resp(200)) as typeof fetch,
      retryBaseMs: 1,
    });
    expect(call.answers.hard_blocker.noul).toBe(0);
    expect(call.inputTokens).toBe(7);
    expect(call.outputTokens).toBe(3);
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('retries a 5xx and succeeds on the second attempt', async () => {
    let n = 0;
    await callJev('state', {
      fetchImpl: (async () => {
        n += 1;
        return resp(n === 1 ? 500 : 200);
      }) as typeof fetch,
      retryBaseMs: 1,
    });
    expect(n).toBe(2);
  });

  it('retries a dropped connection and succeeds', async () => {
    let n = 0;
    await callJev('state', {
      fetchImpl: (async () => {
        n += 1;
        if (n === 1) throw new Error('ECONNRESET');
        return resp(200);
      }) as typeof fetch,
      retryBaseMs: 1,
    });
    expect(n).toBe(2);
  });

  it('gives up after three attempts on a persistent 429', async () => {
    let n = 0;
    await expect(
      callJev('state', {
        fetchImpl: (async () => {
          n += 1;
          return resp(429);
        }) as typeof fetch,
        retryBaseMs: 1,
      }),
    ).rejects.toThrow(/429/);
    expect(n).toBe(3);
  });

  it('does not retry a 400: the request is wrong, not the moment', async () => {
    let n = 0;
    await expect(
      callJev('state', {
        fetchImpl: (async () => {
          n += 1;
          return resp(400);
        }) as typeof fetch,
        retryBaseMs: 1,
      }),
    ).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });
});

describe('renderTable', () => {
  const row: TriageRow = {
    file: 'acme-1.txt',
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

  it('explains both flags in the footer', () => {
    const out = renderTable([row]);
    expect(out).toContain('confidence below 0.5');
    expect(out).toContain('blocker at 0.5 or above');
  });
});
