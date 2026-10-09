// The known-item case log. The operator found these postings somewhere
// else; for each URL, recall reports the furthest stage of fish's pipeline
// the posting reached, so a miss says where it was lost. It is a case log,
// not a rate: the URLs are whatever the operator happened to find, not a
// sample of anything a rate could be read from.

import type { Posting, PostingId } from '../domain/posting.js';
import { postingIdFromFile } from '../domain/posting.js';
import {
  type Board,
  boardOfKey,
  matchesKey,
  parsePostingUrl,
  sameBoard,
} from '../domain/posting-url.js';
import type { DropReason, WatchlistEntry } from '../ports/stores.js';
import type { CareerDependencies } from './dependencies.js';

// From the earliest loss to the furthest progress.
export const RECALL_STAGES = [
  'other-system', // on a system fish has no adapter for
  'job-site', // a job search site's page, not the employer's
  'unknown', // a URL fish does not recognize
  'board-url', // names a board, not a posting
  'not-watched', // the board is not on the watchlist
  'unreadable', // the watched board could not be read just now
  'not-listed', // the watched board does not list it now
  'not-remote', // listed, but not remote by the provider's own fields
  'not-fetched', // listed and remote, but no poll has seen it yet
  'dropped', // seen by a poll, not written
  'written', // written to the cache
] as const;

export type RecallStage = (typeof RECALL_STAGES)[number];

export interface RecallCase {
  url: string;
  stage: RecallStage;
  // What the URL names when fish cannot follow it: a system, a site, or a
  // board as provider/slug.
  names?: string;
  // The watchlist company whose board carries the posting.
  company?: string;
  title?: string;
  workplace?: string;
  location?: string;
  // Why a seen posting was not written, when the seen index recorded it.
  reason?: DropReason;
  observedAt?: string;
  postingId?: PostingId;
  // The judge's composite, or null until triage scores it.
  score?: number | null;
  error?: string;
  // The companies whose boards were read for a job URL that names no board.
  checked?: string[];
}

type Listing = { postings: Posting[] } | { error: string };

export const recallPostings =
  (deps: CareerDependencies) =>
  async (input: { urls: string[] }): Promise<RecallCase[]> => {
    const [watchlist, seen, ledger] = await Promise.all([
      deps.watchlist.read(),
      deps.seen.read(),
      deps.ledger.read(),
    ]);
    const companyOf = (board: Board): string =>
      watchlist.find((e) => sameBoard(e, board))?.name ?? `${board.provider}/${board.slug}`;

    // One live read per watched board per run, through the provider port,
    // the same GET a poll makes.
    const listings = new Map<WatchlistEntry, Listing>();
    const listing = async (entry: WatchlistEntry): Promise<Listing> => {
      const known = listings.get(entry);
      if (known) return known;
      let read: Listing;
      try {
        const provider = deps.providers[entry.provider];
        if (!provider) throw new Error(`unknown provider ${entry.provider}`);
        read = { postings: await provider.list(entry.slug) };
      } catch (err) {
        read = { error: err instanceof Error ? err.message : String(err) };
      }
      listings.set(entry, read);
      return read;
    };

    const recallOne = async (url: string): Promise<RecallCase> => {
      const target = parsePostingUrl(url);
      switch (target.kind) {
        case 'unsupported':
          return { url, stage: 'other-system', names: target.system };
        case 'aggregator':
          return { url, stage: 'job-site', names: target.site };
        case 'unknown':
          return { url, stage: 'unknown' };
        case 'board': {
          const entry = watchlist.find((e) => sameBoard(e, target));
          return {
            url,
            stage: 'board-url',
            names: `${target.provider}/${target.slug}`,
            ...(entry ? { company: entry.name } : {}),
          };
        }
      }

      // The furthest stages first: the seen index holds every remote posting
      // a poll observed, written or dropped, whether or not its board is
      // still watched.
      const key = Object.keys(seen).find((k) => matchesKey(target, k));
      const entry = key ? seen[key] : undefined;
      if (key && entry) {
        const board = boardOfKey(key);
        const company = board ? companyOf(board) : key;
        if (entry.file) {
          const postingId = postingIdFromFile(entry.file);
          const score = ledger.ok ? (ledger.entries[postingId]?.score ?? null) : null;
          return { url, stage: 'written', company, title: entry.title, postingId, score };
        }
        return {
          url,
          stage: 'dropped',
          company,
          title: entry.title,
          reason: entry.dropped,
          observedAt: entry.observedAt,
        };
      }

      // Never seen. A Greenhouse job on an employer's site could be on any
      // watched Greenhouse board; a posting URL names its one board.
      const boards =
        target.kind === 'posting'
          ? watchlist.filter((e) => sameBoard(e, target))
          : watchlist.filter((e) => e.provider === target.provider);
      if (boards.length === 0) {
        return {
          url,
          stage: 'not-watched',
          names: target.kind === 'posting' ? `${target.provider}/${target.slug}` : target.provider,
        };
      }
      // A live read separates a posting that is not remote, one no poll has
      // reached yet, and one the board no longer lists. A board that cannot
      // be read rules nothing out.
      let unreadable: RecallCase | null = null;
      for (const board of boards) {
        const read = await listing(board);
        if ('error' in read) {
          unreadable ??= { url, stage: 'unreadable', company: board.name, error: read.error };
          continue;
        }
        const posting = read.postings.find((p) => matchesKey(target, p.key));
        if (posting?.remote) {
          return { url, stage: 'not-fetched', company: board.name, title: posting.title };
        }
        if (posting) {
          // Where a board states no workplace, its location text decided, so
          // the case carries both.
          return {
            url,
            stage: 'not-remote',
            company: board.name,
            title: posting.title,
            workplace: posting.workplace,
            location: posting.location,
          };
        }
      }
      if (unreadable) return unreadable;
      return target.kind === 'posting'
        ? { url, stage: 'not-listed', company: boards[0]?.name }
        : { url, stage: 'not-listed', names: target.provider, checked: boards.map((b) => b.name) };
    };

    const cases: RecallCase[] = [];
    for (const url of input.urls) cases.push(await recallOne(url));
    return cases;
  };
