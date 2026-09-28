import { admitPostings } from '../domain/admission.js';
import { ApplicationError } from '../domain/errors.js';
import { type Posting, type PostingId, postingFileFromId } from '../domain/posting.js';
import type { SeenEntry } from '../ports/stores.js';
import type { CareerDependencies } from './dependencies.js';

export interface Arrival {
  company: string;
  title: string;
  comp: string;
  postingId: PostingId;
  file: string;
}

// Why a posting never reached the cache. nonRemote is counted before
// admission (the poll keeps remote postings only); thinText and outOfWindow
// come out of the admission table. The outOfWindow bucket is degenerate
// after the first poll: the default window is null then, so it only fires on
// the first run or when the caller passes an explicit window. A posting is
// dropped on first contact or never, because every observed posting is
// marked seen either way.
export interface DropCounts {
  notRemote: number;
  thinText: number;
  outOfWindow: number;
}

export interface FetchOutcome {
  arrivals: Arrival[];
  failures: string[];
  perCompany: {
    name: string;
    total: number;
    remote: number;
    written: number;
    drops: DropCounts;
  }[];
  firstRun: boolean;
}

export interface FetchInput {
  companies?: string[];
  days?: number | null;
}

const MS_PER_DAY = 86_400_000;

export const fetchPostings =
  (deps: CareerDependencies) =>
  async (input: FetchInput = {}): Promise<FetchOutcome> => {
    const watchlist = await deps.watchlist.read();
    if (watchlist.length === 0) {
      throw new ApplicationError('EMPTY_WATCHLIST', 'The watchlist is empty; add companies first.');
    }
    const queries = input.companies ?? [];
    const companies =
      queries.length === 0
        ? watchlist
        : watchlist.filter((c) =>
            queries.some((q) => c.name.toLowerCase().includes(q.toLowerCase())),
          );
    if (companies.length === 0) {
      throw new ApplicationError(
        'INVALID_COMPANY',
        `No watchlist company matches ${queries.join(', ')}.`,
      );
    }

    const seen = await deps.seen.read();
    const firstRun = Object.keys(seen).length === 0;
    const days = input.days !== undefined ? input.days : firstRun ? 14 : null;
    const now = deps.clock.now();
    const cutoff = days === null ? null : now.getTime() - days * MS_PER_DAY;
    // First-observation time, stamped on every posting this poll marks seen
    // for the first time; entries already in the index keep theirs.
    const observedAt = now.toISOString();

    const outcome: FetchOutcome = { arrivals: [], failures: [], perCompany: [], firstRun };
    const newSeen: Record<string, SeenEntry> = {};

    for (const c of companies) {
      const provider = deps.providers[c.provider];
      if (!provider) {
        outcome.failures.push(`${c.name}: unknown provider ${c.provider}`);
        outcome.perCompany.push({
          name: c.name,
          total: 0,
          remote: 0,
          written: 0,
          drops: { notRemote: 0, thinText: 0, outOfWindow: 0 },
        });
        continue;
      }
      let postings: Posting[];
      try {
        postings = await provider.list(c.slug);
      } catch (err) {
        outcome.failures.push(`${c.name}: ${String((err as Error).message ?? err)}`);
        outcome.perCompany.push({
          name: c.name,
          total: 0,
          remote: 0,
          written: 0,
          drops: { notRemote: 0, thinText: 0, outOfWindow: 0 },
        });
        continue;
      }
      const remote = postings.filter((p) => p.remote);
      const prior = { ...seen, ...newSeen };
      const admitted = admitPostings(remote, prior, cutoff);

      // Thin texts get one detail fetch each, then re-admission with the
      // resolved text in hand; the decision table lives in admitPostings.
      const resolved: Record<string, string> = {};
      for (const a of admitted) {
        if (a.decision === 'needs-detail') {
          resolved[a.posting.key] = provider.detail ? await provider.detail(a.posting) : '';
        }
      }
      const decided = Object.keys(resolved).length
        ? admitPostings(remote, prior, cutoff, { resolved })
        : admitted;

      let written = 0;
      const drops: DropCounts = {
        notRemote: postings.length - remote.length,
        thinText: 0,
        outOfWindow: 0,
      };
      for (const a of decided) {
        const p = a.posting;
        switch (a.decision) {
          case 'skip':
            continue;
          case 'out-of-window':
            drops.outOfWindow += 1;
            newSeen[p.key] = { title: p.title, date: p.date, observed: true, observedAt };
            continue;
          case 'thin-text':
          case 'needs-detail':
            drops.thinText += 1;
            newSeen[p.key] = { title: p.title, date: p.date, observed: true, observedAt };
            continue;
          case 'write': {
            const postingId = await deps.postings.save(c.name, { ...p, text: a.text });
            const file = postingFileFromId(postingId);
            newSeen[p.key] = { title: p.title, file, date: p.date, observedAt };
            outcome.arrivals.push({
              company: c.name,
              title: p.title,
              comp: p.comp || 'not stated',
              postingId,
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
        drops,
      });
    }

    await deps.seen.write({ ...seen, ...newSeen });
    return outcome;
  };
