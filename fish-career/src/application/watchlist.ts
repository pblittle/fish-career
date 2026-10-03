import { ApplicationError } from '../domain/errors.js';
import { parsePostingUrl, sameBoard, type UrlTarget } from '../domain/posting-url.js';
import type { WatchlistEntry } from '../ports/stores.js';
import type { CareerDependencies } from './dependencies.js';

export interface ProbeResult {
  slug: string;
  counts: Record<string, number>;
  samples: { provider: string; titles: string[] }[];
}

export const probeCompany =
  (deps: CareerDependencies) =>
  async (input: { slug: string }): Promise<ProbeResult> => {
    const slug = input.slug.trim();
    if (!slug) throw new ApplicationError('INVALID_COMPANY', 'A slug is required to probe.');
    const counts: Record<string, number> = {};
    const samples: ProbeResult['samples'] = [];
    await Promise.all(
      Object.values(deps.providers).map(async (provider) => {
        try {
          const postings = await provider.list(slug);
          counts[provider.id] = postings.length;
          samples.push({
            provider: provider.id,
            titles: postings.slice(0, 3).map((p) => p.title),
          });
        } catch {
          // Not on this provider.
        }
      }),
    );
    return {
      slug,
      counts,
      samples: samples.sort((a, b) => a.provider.localeCompare(b.provider)),
    };
  };

export const listWatchlist = (deps: CareerDependencies) => async (): Promise<WatchlistEntry[]> =>
  deps.watchlist.read();

export interface AddResult {
  added: boolean;
  // The entry written, or the one already on the watchlist when nothing was.
  entry: WatchlistEntry;
}

export const addCompany =
  (deps: CareerDependencies) =>
  async (input: { name?: string; provider: string; slug: string }): Promise<AddResult> => {
    const slug = input.slug.trim();
    const provider = input.provider.trim();
    const name = input.name?.trim() || slug;
    if (!slug) {
      throw new ApplicationError('INVALID_COMPANY', 'A company needs a board slug.');
    }
    if (!deps.providers[provider]) {
      throw new ApplicationError(
        'INVALID_COMPANY',
        `Unknown provider ${provider}. Probe the company first to see which boards carry it.`,
      );
    }
    const entries = await deps.watchlist.read();
    const entry = { name, provider, slug };
    // One name, one entry; one board, one entry, or a poll reads it twice.
    const existing = entries.find(
      (e) => e.name.toLowerCase() === name.toLowerCase() || sameBoard(e, entry),
    );
    if (existing) return { added: false, entry: existing };
    await deps.watchlist.write([...entries, entry]);
    return { added: true, entry };
  };

const BOARDS = 'Ashby, Greenhouse, Lever, and SmartRecruiters';

// Why a URL that names no board on a provider fish reads cannot be watched.
const notABoard = (target: UrlTarget): string => {
  switch (target.kind) {
    case 'unsupported':
      return `That posting is on ${target.system}; fish reads ${BOARDS} boards.`;
    case 'aggregator':
      return `${target.site} lists other employers' postings. Find this one on the employer's own careers page and add that URL.`;
    case 'job':
      return `That is Greenhouse job ${target.jobId} on the employer's own site, which does not name the board. Probe the company for its Greenhouse slug, then add it by provider and slug.`;
    default:
      return `fish can't tell which job board that URL is on; it reads ${BOARDS} boards.`;
  }
};

export const addCompanyFromUrl =
  (deps: CareerDependencies) =>
  async (input: { url: string; name?: string }): Promise<AddResult> => {
    const target = parsePostingUrl(input.url);
    if (target.kind !== 'posting' && target.kind !== 'board') {
      throw new ApplicationError('INVALID_COMPANY', notABoard(target));
    }
    return addCompany(deps)({ name: input.name, provider: target.provider, slug: target.slug });
  };

export const removeCompany =
  (deps: CareerDependencies) =>
  async (input: { name: string }): Promise<{ removed: boolean; name: string }> => {
    const entries = await deps.watchlist.read();
    const name = input.name.trim();
    const next = entries.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
    if (next.length === entries.length) return { removed: false, name };
    await deps.watchlist.write(next);
    return { removed: true, name };
  };
