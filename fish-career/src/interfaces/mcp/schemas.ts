// The MCP wire contract as data: every composable tool declares an output
// schema, and every result carries structuredContent that matches it plus a
// concise text rendering for conversational hosts. Expected failures come
// back as a machine-readable envelope with isError set, never as a thrown
// protocol error a client cannot classify.

import { z } from 'zod';
import { ApplicationError, type ErrorCode } from '../../domain/errors.js';

export const errorEnvelope = z.object({
  error: z.object({
    code: z.string().describe('Stable machine-readable failure code'),
    message: z.string().describe('Human-readable failure message'),
    hint: z.string().optional().describe('What to do next'),
  }),
});

export const dimensionSchema = z.object({
  value: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const triageRowSchema = z.object({
  postingId: z.string(),
  title: z.string(),
  company: z.string(),
  composite: z.number().min(0).max(1),
  dims: z.record(z.string(), dimensionSchema),
  blocker: z.number().min(0).max(1),
  variants: z.array(z.string()).optional(),
});

export const watchlistProbeOutput = z.union([
  z.object({
    slug: z.string(),
    counts: z.record(z.string(), z.number()),
    samples: z.array(z.object({ provider: z.string(), titles: z.array(z.string()) })),
  }),
  errorEnvelope,
]);

export const watchlistAddOutput = z.union([
  z.object({
    name: z.string(),
    provider: z.string(),
    slug: z.string(),
    added: z.boolean(),
  }),
  errorEnvelope,
]);

export const watchlistRemoveOutput = z.union([
  z.object({ name: z.string(), removed: z.boolean() }),
  errorEnvelope,
]);

export const fetchPostingsOutput = z.union([
  z.object({
    arrivals: z.array(
      z.object({
        company: z.string(),
        title: z.string(),
        comp: z.string(),
        postingId: z.string(),
      }),
    ),
    failures: z.array(z.string()),
    perCompany: z.array(
      z.object({ name: z.string(), total: z.number(), remote: z.number(), written: z.number() }),
    ),
    firstRun: z.boolean(),
  }),
  errorEnvelope,
]);

export const triagePostingsOutput = z.union([
  z.object({
    runId: z.string().describe('The run ID, readable at fish://runs/{runId}'),
    rows: z.array(triageRowSchema),
    errors: z.array(z.string()),
    scored: z.array(z.string()),
    skipped: z.number(),
    ledgerOk: z.boolean(),
  }),
  errorEnvelope,
]);

export const evaluateRankingOutput = z.union([
  z.object({
    satisfied: z.number(),
    total: z.number(),
    violations: z.array(
      z.object({
        better: z.string(),
        worse: z.string(),
        betterRank: z.number(),
        worseRank: z.number(),
        source: z.string(),
      }),
    ),
  }),
  errorEnvelope,
]);

export const calibrationStartOutput = z.union([
  z.object({
    postingIds: z.array(z.string()),
    seed: z.number(),
    slice: z.array(z.object({ postingId: z.string(), company: z.string(), title: z.string() })),
  }),
  errorEnvelope,
]);

// `z.nullable()` emits `type: ["number","null"]`, which single-type dialects
// (Gemini function declarations, OpenAPI 3.0) reject or drop. A union emits
// anyOf branches instead, which Inspector's portability check accepts.
const nullableNumber = z.union([z.number(), z.null()]);

export const calibrationResultOutput = z.union([
  z.object({
    at: z.string(),
    rho: nullableNumber,
    postingIds: z.array(z.string()),
    humanRanking: z.array(z.string()),
    rows: z.array(triageRowSchema),
    previousRho: nullableNumber.optional(),
    errors: z.array(z.string()),
  }),
  errorEnvelope,
]);

export const profileUpdateOutput = z.union([z.object({ written: z.boolean() }), errorEnvelope]);

export interface ToolResult {
  // The SDK's callback return type carries an open index signature; keeping
  // it here lets the helpers satisfy both success and error paths.
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export const ok = (text: string, structured: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent: structured,
});

const HINTS: Partial<Record<ErrorCode, string>> = {
  NO_JUDGE: 'Put a TypeSafe API key in FISH_HOME/.env, or set FISH_JUDGE=fake.',
  NO_PROFILE: 'Write one with profile_update first.',
  EMPTY_WATCHLIST: 'Probe and add a company with watchlist_probe and watchlist_add.',
  NOTHING_TO_SCORE: 'Fetch new postings, or rescore to redo the cache.',
  NO_PREFERENCES: 'Create FISH_HOME/preferences.json with the pairs the ranking must respect.',
  POSTING_NOT_FOUND: 'List the cache from the fish://postings resource.',
  INVALID_RANKING: 'Rank every posting in the pending slice.',
  NO_PENDING_CALIBRATION: 'Start one with calibration_start.',
  NO_CALIBRATION_HISTORY: 'Run calibration_start and calibration_submit first.',
  INVALID_COMPANY: 'Probe the company first to see which boards carry it.',
  LEDGER_UNREADABLE: 'Check FISH_HOME/state/scored.json; the next triage run will rewrite it.',
};

// An expected failure is a result, not a thrown error: the client gets a
// stable code it can branch on and a hint the operator can act on.
export const failure = (err: unknown): ToolResult => {
  const code: ErrorCode = err instanceof ApplicationError ? err.code : 'UNKNOWN';
  const message = String((err as Error).message ?? err);
  const hint = HINTS[code];
  const text = [message, hint ? `Hint: ${hint}` : ''].filter(Boolean).join('\n');
  return {
    content: [{ type: 'text', text }],
    structuredContent: { error: { code, message, ...(hint ? { hint } : {}) } },
    isError: true,
  };
};
