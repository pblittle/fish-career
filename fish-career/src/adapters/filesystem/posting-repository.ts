import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Posting,
  type PostingId,
  type PostingRecord,
  postingIdFromFile,
} from '../../domain/posting.js';
import type { PostingRepository } from '../../ports/posting-repository.js';

const safe = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const postingFile = (company: string, key: string): string =>
  `${safe(company)}-${safe(key.split(':').pop() ?? key)}.txt`;

const field = (raw: string, name: string): string =>
  raw.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim() ?? '';

const parse = (file: string, raw: string): PostingRecord => ({
  id: postingIdFromFile(file),
  file,
  title: field(raw, 'TITLE'),
  company: field(raw, 'COMPANY'),
  location: field(raw, 'LOCATION'),
  compensation: field(raw, 'COMPENSATION'),
  url: field(raw, 'URL'),
  published: field(raw, 'PUBLISHED'),
  text: raw,
});

export const filePostingRepository = (dir: string): PostingRepository => ({
  async list(): Promise<PostingRecord[]> {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    return names
      .filter((f) => /\.(txt|md)$/i.test(f))
      .sort()
      .map((file) => parse(file, readFileSync(join(dir, file), 'utf8')));
  },
  async get(id: PostingId): Promise<PostingRecord | null> {
    for (const ext of ['txt', 'md']) {
      try {
        return parse(`${id}.${ext}`, readFileSync(join(dir, `${id}.${ext}`), 'utf8'));
      } catch {
        // Try the next extension.
      }
    }
    return null;
  },
  async save(company: string, posting: Posting): Promise<PostingId> {
    const header = [
      `TITLE: ${posting.title}`,
      `COMPANY: ${company}`,
      `LOCATION: ${posting.location}${posting.workplace ? ` (${posting.workplace})` : ''}`,
      `COMPENSATION: ${posting.comp || 'not stated'}`,
      `URL: ${posting.url}`,
      `PUBLISHED: ${posting.date}`,
    ].join('\n');
    const file = postingFile(company, posting.key);
    writeFileSync(join(dir, file), `${header}\n\n${posting.text}\n`);
    return postingIdFromFile(file);
  },
});
