// The TypeSafe judge adapter. A judge call is idempotent and a run is long,
// so a 429, a 5xx, or a dropped connection costs a backoff and a retry, never
// the row; any other failure is the request's own fault and throws at once.
// `fetchImpl` and `retryBaseMs` exist so the retry policy is tested without a
// network or real sleeps.
//
// The response is validated at this boundary: the API returns whatever the
// model emitted, and a missing or non-finite probability must fail that
// posting loudly rather than be clamped into a score nobody can explain.

import { z } from 'zod';
import type { JevAnswers } from '../../domain/answers.js';
import { DIMENSIONS, questions } from '../../domain/rubric.js';
import type { Judge, JudgeAnswer } from '../../ports/judge.js';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const dimensionSchema = z
  .object({
    score: z.number().finite(),
    confidence: z.number().min(0).max(1),
  })
  .catchall(z.unknown());

const answersSchema = z
  .object({
    hard_blocker: z.object({ noul: z.number().min(0).max(1) }).catchall(z.unknown()),
    ...Object.fromEntries(DIMENSIONS.map((d) => [d.id, dimensionSchema])),
  })
  .catchall(z.unknown());

export class JudgeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeResponseError';
  }
}

export const validateAnswers = (value: unknown): JevAnswers => {
  const parsed = answersSchema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new JudgeResponseError(`judge response failed validation: ${detail}`);
  }
  return parsed.data as JevAnswers;
};

export interface JevCall {
  answers: JevAnswers;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface JevOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  retryBaseMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callJev(state: string, opts: JevOptions = {}): Promise<JevCall> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.retryBaseMs ?? RETRY_BASE_MS;
  const timeout = opts.timeoutMs ?? JEV_TIMEOUT_MS;
  const model = opts.model ?? 'jev-latest';
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY ?? '';
  const started = Date.now();
  let lastError = 'no attempt ran';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await doFetch(JEV_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, model, questions }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      lastError = String((err as Error).message ?? err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`judge call failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
      }
      await sleep(base * 2 ** (attempt - 1));
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as {
        answers?: unknown;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        answers: validateAnswers(body.answers),
        latencyMs: Date.now() - started,
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        model,
      };
    }
    lastError = `judge API responded ${res.status}: ${(await res.text()).slice(0, 200)}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(lastError);
    }
    await sleep(base * 2 ** (attempt - 1));
  }
  throw new Error(lastError);
}

export class JevJudge implements Judge {
  private readonly opts: JevOptions;

  constructor(opts: JevOptions = {}) {
    this.opts = opts;
  }

  async ask(state: string): Promise<JudgeAnswer> {
    const call = await callJev(state, this.opts);
    return {
      answers: call.answers,
      latencyMs: call.latencyMs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      model: call.model,
    };
  }
}
