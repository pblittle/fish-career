// Judge answers and the table row they become. The judge is untrusted: the
// API returns whatever the model emitted, so every probability is clamped at
// this boundary before it can reach the composite, the ledger, or the table.

import type { PostingId } from './posting.js';
import { DIMENSIONS } from './rubric.js';

export interface JevAnswers {
  hard_blocker: { noul: number };
  [dimensionId: string]: {
    score?: number;
    confidence?: number;
    noul?: number;
  } & Record<string, unknown>;
}

export interface TriageRow {
  postingId: PostingId;
  title: string;
  company: string;
  composite: number;
  dims: Record<string, { value: number; confidence: number }>;
  blocker: number;
  variants?: string[];
}

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const normalized = (answers: JevAnswers, id: string): number => {
  const dim = DIMENSIONS.find((d) => d.id === id);
  if (!dim) return 0;
  return Math.min(1, Math.max(0, finite(answers[id]?.score) / (dim.criteria.length - 1)));
};

export const composite = (answers: JevAnswers): number =>
  DIMENSIONS.reduce((sum, d) => sum + d.weight * normalized(answers, d.id), 0);

// One table row from judge answers. Split out so the eval slice can be
// rebuilt from recorded answers with no network and no second copy of the
// scoring math.
export const rowFromAnswers = (
  postingId: PostingId,
  answers: JevAnswers,
  meta: { title: string; company: string },
): TriageRow => {
  const dims: TriageRow['dims'] = {};
  for (const d of DIMENSIONS) {
    const top = d.criteria.length - 1;
    const score = answers[d.id]?.score;
    dims[d.id] = {
      value: Math.min(
        1,
        Math.max(0, (typeof score === 'number' && Number.isFinite(score) ? score : 0) / top),
      ),
      confidence: Math.min(1, Math.max(0, answers[d.id]?.confidence ?? 0)),
    };
  }
  return {
    postingId,
    title: meta.title,
    company: meta.company,
    composite: composite(answers),
    dims,
    blocker: Math.min(1, Math.max(0, answers.hard_blocker?.noul ?? 0)),
  };
};
