import type { Posting, PostingId, PostingRecord } from '../domain/posting.js';

// The posting cache. IDs are stable; file layout is the adapter's business.
export interface PostingRepository {
  list(): Promise<PostingRecord[]>;
  get(id: PostingId): Promise<PostingRecord | null>;
  save(company: string, posting: Posting): Promise<PostingId>;
}
