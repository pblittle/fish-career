import { ApplicationError } from '../domain/errors.js';
import type { PostingId, PostingRecord } from '../domain/posting.js';
import type { CareerDependencies } from './dependencies.js';

export interface PostingSummary {
  postingId: PostingId;
  title: string;
  company: string;
  location: string;
  compensation: string;
  url: string;
  published: string;
}

export const getProfile = (deps: CareerDependencies) => async (): Promise<string> =>
  deps.profile.read();

export const updateProfile =
  (deps: CareerDependencies) =>
  async (content: string): Promise<void> => {
    if (!content.trim()) {
      throw new ApplicationError('NO_PROFILE', 'The profile cannot be empty.');
    }
    await deps.profile.write(content);
  };

export const listPostings = (deps: CareerDependencies) => async (): Promise<PostingSummary[]> => {
  const records = await deps.postings.list();
  return records
    .map((r) => ({
      postingId: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      compensation: r.compensation,
      url: r.url,
      published: r.published,
    }))
    .sort((a, b) => a.postingId.localeCompare(b.postingId));
};

export const readPosting =
  (deps: CareerDependencies) =>
  async (input: { postingId: PostingId }): Promise<PostingRecord> => {
    const record = await deps.postings.get(input.postingId);
    if (!record) {
      throw new ApplicationError(
        'POSTING_NOT_FOUND',
        `No posting in the cache named ${input.postingId}.`,
      );
    }
    return record;
  };
