// Jev scoring: one request per posting, five Score dimensions plus a Noul
// hard-blocker, weights combined in code. The dimensions and weights are
// the operator's judgment, stated here where they can be argued with.

import { createHash } from 'node:crypto';

export const DIMENSIONS = [
  {
    id: 'skills',
    weight: 0.35,
    instructions:
      "How directly do the posting's required skills match the candidate's stated skills?",
    criteria: [
      "Almost none of the posting's required skills appear among the candidate's stated skills",
      'Some required skills match, but a core requirement of the role is missing',
      'Most required skills match, with a few gaps the candidate could close on the job',
      "The posting's requirements are skills the candidate has used in depth",
    ],
  },
  {
    id: 'level',
    weight: 0.15,
    instructions: "How does the posting's seniority compare to the candidate's stated level?",
    criteria: [
      "The posting is far above the candidate's stated level; the stated experience bar is not met",
      "The posting is somewhat above the candidate's stated level",
      "The posting matches the candidate's stated level",
      "The posting is below the candidate's stated level; the candidate would be overqualified",
    ],
  },
  {
    id: 'location',
    weight: 0.2,
    instructions:
      "Does the role's location or remote policy fit the candidate's stated constraint?",
    criteria: [
      "The role is on-site or hybrid in a location the candidate's constraints rule out",
      'The role would require a relocation the candidate has not said they want',
      'The location or remote policy is not stated clearly enough to judge',
      "The remote policy or location matches the candidate's stated constraint",
    ],
  },
  {
    id: 'comp',
    weight: 0.1,
    instructions:
      "What does the posting suggest about compensation relative to the candidate's stated floor?",
    criteria: [
      "The posting states or strongly suggests compensation below the candidate's stated floor",
      'The posting gives no compensation signal',
      "Compensation hints are consistent with the candidate's floor, without stating a number",
      "The posting states compensation at or above the candidate's stated floor",
    ],
  },
  {
    id: 'domain',
    weight: 0.2,
    instructions:
      "How does the posting's domain align with what the candidate says they want to work on?",
    criteria: [
      'The work is in a domain the candidate has ruled out or shown no interest in',
      "The domain is neither named in the candidate's interests nor ruled out",
      'The work touches a domain the candidate has some interest in',
      'The work is squarely in a domain the candidate says they want',
    ],
  },
] as const;

export const LOW_CONFIDENCE = 0.5;
export const BLOCKER_FLAG = 0.5;

export const BLOCKER_INSTRUCTIONS =
  "The posting states a hard requirement the candidate explicitly cannot meet, such as work authorization, a required certification, a required location or relocation, or an experience bar far beyond the candidate's. Requirements the candidate could plausibly satisfy do not count.";

// Bump when the dimensions, criteria or blocker instructions change meaning,
// so a ledger entry can say which rubric produced it and a later run can tell
// the score is no longer the current judgment.
export const RUBRIC_VERSION = 1;

// Everything a stored score is a judgment against: the profile text and the
// rubric itself. Change either and old numbers stop being current.
export const profileHash = (profile: string): string =>
  createHash('sha256')
    .update(profile)
    .update('\n')
    .update(JSON.stringify(DIMENSIONS))
    .update(BLOCKER_INSTRUCTIONS)
    .digest('hex')
    .slice(0, 12);

export interface JevAnswers {
  hard_blocker: { noul: number };
  [dimensionId: string]: {
    score?: number;
    confidence?: number;
    noul?: number;
  } & Record<string, unknown>;
}

const questions = Object.fromEntries([
  ['hard_blocker', { type: 'noul', instructions: BLOCKER_INSTRUCTIONS }],
  ...DIMENSIONS.map((d) => [
    d.id,
    { type: 'score', instructions: d.instructions, criteria: d.criteria },
  ]),
]);

export const stateFor = (profile: string, posting: string): string =>
  `CANDIDATE PROFILE:\n${profile}\n\nJOB POSTING:\n${posting}`;

// One judge call with the cost and latency a trace and an eval both need.
export interface JevCall {
  answers: JevAnswers;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A judge call is idempotent and a run is long, so a 429, a 5xx or a dropped
// connection costs a backoff and a retry, never the row. Any other failure is
// the request's own fault and throws at once. `fetchImpl` and `retryBaseMs`
// exist so the retry policy is testable without a network or real sleeps.
export async function callJev(
  state: string,
  opts: { fetchImpl?: typeof fetch; retryBaseMs?: number } = {},
): Promise<JevCall> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.retryBaseMs ?? RETRY_BASE_MS;
  const started = Date.now();
  let lastError = 'no attempt ran';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await doFetch(JEV_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.TYPESAFE_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, model: 'jev-latest', questions }),
        signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = String((err as Error).message ?? err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Jev call failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
      }
      await sleep(base * 2 ** (attempt - 1));
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      return {
        answers: body.answers as JevAnswers,
        latencyMs: Date.now() - started,
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      };
    }
    lastError = `Jev API responded ${res.status}: ${(await res.text()).slice(0, 200)}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(lastError);
    }
    await sleep(base * 2 ** (attempt - 1));
  }
  throw new Error(lastError);
}

// Model output is not schema-checked by the API: `answers` arrives as
// whatever the judge emitted. A non-finite score would propagate NaN into
// composite, the ledger, and the table (JSON.stringify nulls NaN, which
// then fails the ledger's own finiteness check and reads as corruption).
// Guard at the boundary once: non-finite scores read as 0, and every
// probability is clamped to 0..1.
const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const normalized = (answers: JevAnswers, id: string): number => {
  const dim = DIMENSIONS.find((d) => d.id === id);
  if (!dim) return 0;
  return Math.min(1, Math.max(0, finite(answers[id]?.score) / (dim.criteria.length - 1)));
};

export const composite = (answers: JevAnswers): number =>
  DIMENSIONS.reduce((sum, d) => sum + d.weight * normalized(answers, d.id), 0);

export interface TriageRow {
  file: string;
  title: string;
  company: string;
  composite: number;
  dims: Record<string, { value: number; confidence: number }>;
  blocker: number;
  variants?: string[];
}

// Blocker demotion first, composite second: a posting naming a hard
// requirement the candidate cannot meet is not the best row in the table no
// matter its scores. Sorting by composite alone left 0.86-blocker rows above
// clean fits and leaned on a footnote to explain itself.
export const rankRows = (rows: TriageRow[]): TriageRow[] =>
  [...rows].sort(
    (a, b) =>
      Number(a.blocker >= BLOCKER_FLAG) - Number(b.blocker >= BLOCKER_FLAG) ||
      b.composite - a.composite,
  );

// Boards post one remote role once per office ("(Remote)", "(Dallas)",
// "(Austin)"), and three top rows for one vacancy is a table that lies about
// choice. The highest row stands; the others keep their office labels.
export const roleKey = (title: string): string =>
  title
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();

export const collapseVariants = (rows: TriageRow[]): TriageRow[] => {
  const groups = new Map<string, TriageRow[]>();
  for (const r of rankRows(rows)) {
    const key = `${r.company.toLowerCase()}::${roleKey(r.title)}`;
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

// Renders the ranked result as text an MCP host shows the agent. Deliberately
// the same table the CLI prints, so both surfaces read identically.
export const renderTable = (rows: TriageRow[]): string => {
  const header =
    'rank  posting                                        match  skills  level  loc    comp   domain  blocker';
  const lines = rows.map((r, i) => {
    const cell = (id: string) => {
      const c = r.dims[id];
      const flag = c.confidence < LOW_CONFIDENCE ? '?' : ' ';
      return `${Math.round(c.value * 100)}%${flag}`;
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
