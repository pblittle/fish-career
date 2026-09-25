import type { Posting } from '../../domain/posting.js';
import type { AtsProvider, AtsProviders } from '../../ports/ats-provider.js';

// A provider backed by an object: slug to postings. Tests and the demo use it
// to exercise the fetch use case with no network.
export const memoryProviders = (
  boards: Record<string, Record<string, Posting[]>>,
): AtsProviders => {
  const providers: Record<string, AtsProvider> = {};
  for (const [id, slugs] of Object.entries(boards)) {
    providers[id] = {
      id,
      async list(slug: string): Promise<Posting[]> {
        const postings = slugs[slug];
        if (!postings) throw new Error(`no board ${slug} on ${id}`);
        return postings;
      },
    };
  }
  return providers;
};

export const memoryProvider = (
  id: string,
  boards: Record<string, Posting[]>,
  detail?: (posting: Posting) => Promise<string>,
): AtsProvider => ({
  id,
  async list(slug: string): Promise<Posting[]> {
    const postings = boards[slug];
    if (!postings) throw new Error(`no board ${slug} on ${id}`);
    return postings;
  },
  ...(detail ? { detail } : {}),
});
