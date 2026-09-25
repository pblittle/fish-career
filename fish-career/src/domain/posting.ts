// The posting, canonical shape. Providers flatten their board responses into
// this; the cache stores it as a header plus body; the judge reads it. The
// stable identifier is the file stem, so a posting keeps one ID across the
// ledger, traces, calibrations, and every surface.

export interface Posting {
  key: string;
  title: string;
  location: string;
  workplace: string;
  remote: boolean;
  comp: string;
  url: string;
  date: string;
  text: string;
  detailUrl?: string;
}

export type PostingId = string;

export const postingIdFromFile = (file: string): PostingId => file.replace(/\.(txt|md)$/i, '');

export const postingFileFromId = (id: PostingId): string => `${id}.txt`;

// The posting text a score was made against. Recorded per trace so a later
// re-scoring can tell whether the posting itself changed under the same ID.
export const postingHash = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

// A posting with less text than this cannot be scored meaningfully; the
// fetch engine asks the provider for its detail endpoint instead, and
// baselines the posting if that comes back thin too.
export const MIN_SCORABLE_TEXT = 80;

export interface PostingRecord {
  id: PostingId;
  file: string;
  title: string;
  company: string;
  location: string;
  compensation: string;
  url: string;
  published: string;
  text: string;
}
