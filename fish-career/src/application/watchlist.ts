import { ApplicationError } from '../domain/errors.js';
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

export const addCompany =
  (deps: CareerDependencies) =>
  async (entry: WatchlistEntry): Promise<{ added: boolean; entry: WatchlistEntry }> => {
    const name = entry.name.trim();
    const slug = entry.slug.trim();
    const provider = entry.provider.trim();
    if (!name || !slug) {
      throw new ApplicationError('INVALID_COMPANY', 'A company needs a name and a board slug.');
    }
    if (!deps.providers[provider]) {
      throw new ApplicationError(
        'INVALID_COMPANY',
        `Unknown provider ${provider}. Probe the company first to see which boards carry it.`,
      );
    }
    const entries = await deps.watchlist.read();
    if (entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      return { added: false, entry: { name, provider, slug } };
    }
    const next = [...entries, { name, provider, slug }];
    await deps.watchlist.write(next);
    return { added: true, entry: { name, provider, slug } };
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
