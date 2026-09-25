// The admission decision for one posting, split out from I/O so the
// window/dedupe/thin-text semantics are testable without a network.
//
//   skip          the seen index (or this poll) already holds it
//   baseline      out of the recency window: observed, never written
//   needs-detail  text too thin to score; fetch the detail endpoint, then
//                 re-admit with the result in opts.resolved
//   write         in window with scorable text; Admission.text is what to write

import { MIN_SCORABLE_TEXT, type Posting } from './posting.js';

export type AdmissionDecision = 'skip' | 'baseline' | 'needs-detail' | 'write';

export interface Admission {
  posting: Posting;
  decision: AdmissionDecision;
  text: string;
}

export function admitPostings(
  postings: Posting[],
  seen: Record<string, unknown>,
  cutoff: number | null,
  opts: { resolved?: Record<string, string> } = {},
): Admission[] {
  const out: Admission[] = [];
  const seenThisPoll = new Set<string>(Object.keys(seen));
  for (const posting of postings) {
    if (seenThisPoll.has(posting.key)) {
      out.push({ posting, decision: 'skip', text: '' });
      continue;
    }
    seenThisPoll.add(posting.key);
    const t = Date.parse(posting.date);
    const inWindow = cutoff === null || Number.isNaN(t) || t >= cutoff;
    if (!inWindow) {
      out.push({ posting, decision: 'baseline', text: '' });
      continue;
    }
    const resolved = opts.resolved?.[posting.key];
    const text = resolved !== undefined ? resolved : posting.text;
    if (!text || text.length < MIN_SCORABLE_TEXT) {
      out.push({
        posting,
        decision: resolved === undefined ? 'needs-detail' : 'baseline',
        text: '',
      });
      continue;
    }
    out.push({ posting, decision: 'write', text });
  }
  return out;
}
