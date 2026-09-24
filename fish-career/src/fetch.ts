// The fetch engine, shared by the CLI and the MCP tool so the dedupe
// semantics can never drift between surfaces. Every REMOTE posting a poll
// observes is marked seen, written or not: postings that existed before
// the first poll are baseline rather than news, and only arrivals are
// ever delivered. A recency window applies only when the caller passes
// one (first run, or an explicit --days).

import type { WatchlistEntry } from './config.js';
import { MIN_SCORABLE_TEXT, type Posting, PROVIDERS, writePostingFile } from './providers.js';

export interface Arrival {
  company: string;
  title: string;
  comp: string;
  file: string;
}

export interface FetchOutcome {
  arrivals: Arrival[];
  newSeen: Record<string, { title: string; date?: string; file?: string; observed?: boolean }>;
  failures: string[];
  perCompany: { name: string; total: number; remote: number; written: number }[];
}

// The admission decision for one posting, split out from the I/O so the
// window/dedupe/thin-text semantics are testable without a network.
//
//   skip          seen.json (or this poll) already holds it
//   baseline      out of the recency window: observed, never written
//   needs-detail  text too thin to score; fetch the detail endpoint, then
//                 re-admit with the result in opts.resolved
//   write         in window with scorable text; Admission.text is what to write
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

const detailFor = async (providerId: string, p: Posting): Promise<string> => {
  const provider = PROVIDERS[providerId];
  return provider?.detail ? provider.detail(p) : '';
};

export const MS_PER_DAY = 86_400_000;

export async function fetchAll(
  watchlist: WatchlistEntry[],
  opts: { postingsDir: string; seen: Record<string, unknown>; days: number | null },
): Promise<FetchOutcome> {
  const now = Date.now();
  const cutoff = opts.days !== null ? now - opts.days * MS_PER_DAY : null;
  const outcome: FetchOutcome = { arrivals: [], newSeen: {}, failures: [], perCompany: [] };

  for (const c of watchlist) {
    const provider = PROVIDERS[c.provider];
    if (!provider) {
      outcome.failures.push(`${c.name}: unknown provider ${c.provider}`);
      continue;
    }
    let postings: Posting[] = [];
    try {
      postings = await provider.list(c.slug);
    } catch (err) {
      outcome.failures.push(`${c.name}: ${String((err as Error).message ?? err)}`);
      outcome.perCompany.push({ name: c.name, total: 0, remote: 0, written: 0 });
      continue;
    }
    const remote = postings.filter((p) => p.remote);
    const admitted = admitPostings(remote, { ...opts.seen, ...outcome.newSeen }, cutoff);

    // Thin texts get one detail fetch each, then re-admission with the
    // resolved text in hand; the decision table lives in admitPostings.
    const resolved: Record<string, string> = {};
    for (const a of admitted) {
      if (a.decision === 'needs-detail') {
        resolved[a.posting.key] = await detailFor(c.provider, a.posting);
      }
    }
    const decided = Object.keys(resolved).length
      ? admitPostings(remote, { ...opts.seen, ...outcome.newSeen }, cutoff, { resolved })
      : admitted;

    let written = 0;
    for (const a of decided) {
      const p = a.posting;
      switch (a.decision) {
        case 'skip':
          continue;
        case 'baseline':
          outcome.newSeen[p.key] = { title: p.title, date: p.date, observed: true };
          continue;
        case 'needs-detail':
          // No detail source could resolve this one; observe it so the
          // next poll does not re-ask.
          outcome.newSeen[p.key] = { title: p.title, date: p.date, observed: true };
          continue;
        case 'write': {
          const file = writePostingFile(opts.postingsDir, c.name, { ...p, text: a.text });
          outcome.newSeen[p.key] = { title: p.title, file, date: p.date };
          outcome.arrivals.push({
            company: c.name,
            title: p.title,
            comp: p.comp || 'not stated',
            file,
          });
          written += 1;
        }
      }
    }
    outcome.perCompany.push({
      name: c.name,
      total: postings.length,
      remote: remote.length,
      written,
    });
  }
  return outcome;
}
