import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from '../../domain/rubric.js';
import { callJev, JudgeResponseError, validateAnswers } from './jev.js';

const fullAnswers = (): Record<string, unknown> => ({
  hard_blocker: { noul: 0 },
  ...Object.fromEntries(DIMENSIONS.map((d) => [d.id, { score: 2, confidence: 0.8 }])),
});

describe('validateAnswers', () => {
  it('accepts a complete answer set with extra fields', () => {
    const answers = validateAnswers({
      ...fullAnswers(),
      skills: { score: 2, confidence: 0.8, legend: { 2: 'most' }, probabilities: { 2: 0.8 } },
    });
    expect(answers.skills?.score).toBe(2);
  });

  it('rejects a missing dimension instead of silently scoring it zero', () => {
    const partial = fullAnswers() as Record<string, unknown>;
    delete partial.location;
    expect(() => validateAnswers(partial)).toThrow(JudgeResponseError);
    expect(() => validateAnswers(partial)).toThrow(/location/);
  });

  it('rejects a non-finite score', () => {
    const answers = fullAnswers();
    answers.skills = { score: Number.POSITIVE_INFINITY, confidence: 0.8 };
    expect(() => validateAnswers(answers)).toThrow(/skills/);
  });

  it('rejects a confidence outside 0..1', () => {
    const answers = fullAnswers();
    answers.skills = { score: 2, confidence: 3 };
    expect(() => validateAnswers(answers)).toThrow(/confidence/);
  });

  it('rejects a missing hard blocker', () => {
    const answers = fullAnswers();
    delete answers.hard_blocker;
    expect(() => validateAnswers(answers)).toThrow(/hard_blocker/);
  });
});

describe('callJev', () => {
  const answers = fullAnswers();
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
    expect(call.model).toBe('jev-latest');
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

  it('fails the call when the response does not validate', async () => {
    const bad = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answers: { hard_blocker: { noul: 0 } } }),
      text: async () => '',
    })) as unknown as typeof fetch;
    await expect(callJev('state', { fetchImpl: bad, retryBaseMs: 1 })).rejects.toThrow(
      /validation/,
    );
  });
});
