import type { PostingId } from '../domain/posting.js';
import {
  type ArrivalPrecision,
  coverage,
  type Grade,
  precisionAtArrival,
} from '../domain/verdicts.js';
import type { CareerDependencies } from './dependencies.js';
import { requireVerdicts } from './record-verdict.js';

export interface ArrivalRow {
  postingId: PostingId;
  company: string;
  title: string;
  comp: string;
  published: string;
  label: Grade | null;
}

export interface ArrivalListing {
  arrivals: ArrivalRow[];
  graded: number;
  ungraded: number;
}

// The arrivals are what fetch wrote to the cache; a verdict takes one out of
// the pending list. Ungraded is a state, not a miss.
export const listArrivals = (deps: CareerDependencies) => async (): Promise<ArrivalListing> => {
  const verdicts = await requireVerdicts(deps);
  const records = await deps.postings.list();
  const arrivals = records
    .map((r) => ({
      postingId: r.id,
      company: r.company,
      title: r.title,
      comp: r.compensation,
      published: r.published,
      label: verdicts[r.id]?.label ?? null,
    }))
    .sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  const graded = arrivals.filter((a) => a.label !== null).length;
  return { arrivals, graded, ungraded: arrivals.length - graded };
};

export interface VerdictSummary {
  cached: number;
  graded: number;
  coverage: number | null;
  precision: ArrivalPrecision;
}

// Coverage is graded over cached; precision@arrival is label >= 2 over
// graded arrivals. Both are defined in domain/verdicts.ts, including the
// floor below which the precision line reads "no read" rather than a number.
export const verdictSummary = (deps: CareerDependencies) => async (): Promise<VerdictSummary> => {
  const verdicts = await requireVerdicts(deps);
  const records = await deps.postings.list();
  const ids = records.map((r) => r.id);
  const graded = ids.filter((id) => verdicts[id] !== undefined).length;
  return {
    cached: ids.length,
    graded,
    coverage: coverage(graded, ids.length),
    precision: precisionAtArrival(ids, verdicts),
  };
};
