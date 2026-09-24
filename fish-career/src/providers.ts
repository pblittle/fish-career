// The four public ATS APIs, mapped to one flat posting shape. Board
// verification (probe) lives here too so watchlist_add can confirm a
// company's identity before anything is written.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

// A posting with less text than this cannot be scored meaningfully; the
// fetch engine asks the provider for its detail endpoint instead, and
// baselines the posting if that comes back thin too.
export const MIN_SCORABLE_TEXT = 80;

// One ATS API surface. `detail` exists only where the list endpoint omits
// the posting body (SmartRecruiters); the type says so, which is why
// fetch.ts needs no cast to ask.
export interface Provider {
  list(slug: string): Promise<Posting[]>;
  detail?(p: Posting): Promise<string>;
}

export const REQUEST_TIMEOUT_MS = 20_000;

const get = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
};

// The parse edge for all four boards: narrow the unknown JSON to the few
// fields a Posting is built from, tolerating absence with defaults rather
// than crashing. A schema change upstream degrades one field to empty,
// not the whole poll to a mystery failure.
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(rec) : []);

// Lever sends salaryRange as {min, max, currency}; the other boards send a
// string or nothing. One formatter so a structured range is not dropped.
export const formatComp = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const range = rec(v);
  const min = typeof range.min === 'number' ? range.min : null;
  const max = typeof range.max === 'number' ? range.max : null;
  if (min === null && max === null) return '';
  const span = [min, max].filter((n) => n !== null).join(' – ');
  const currency = str(range.currency);
  return currency ? `${span} ${currency}` : span;
};

// Greenhouse ships content entity-escaped TWICE, so entities decode in a
// loop until stable before tags are stripped; one pass leaves "&amp;".
const decodeEntities = (s: string): string => {
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;|&rsquo;/gi, "'")
      .replace(/&ndash;/gi, '-')
      .replace(/&mdash;/gi, '-')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
  } while (s !== prev);
  return s;
};

export const htmlToText = (s: string | null | undefined): string =>
  decodeEntities(String(s ?? ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const ashby: Provider = {
  async list(slug: string): Promise<Posting[]> {
    const b = rec(
      await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`),
    );
    return arr(b.jobs).map((j) => {
      const jobUrl = str(j.jobUrl);
      const title = str(j.title);
      const workplace = str(j.workplaceType);
      return {
        key: `ashby:${slug}:${jobUrl.split('/').pop() || title}`,
        title,
        location: str(j.location),
        workplace,
        remote: workplace === 'Remote' || j.isRemote === true,
        comp: str(rec(j.compensation).compensationTierSummary) || str(j.compensationTierSummary),
        url: jobUrl,
        date: str(j.publishedAt),
        text: str(j.descriptionPlain) || htmlToText(str(j.descriptionHtml)),
      };
    });
  },
};

const greenhouse: Provider = {
  async list(slug: string): Promise<Posting[]> {
    const b = rec(
      await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`),
    );
    return arr(b.jobs).map((j) => {
      const location = str(rec(j.location).name);
      const remote = /remote/i.test(location);
      return {
        key: `gh:${slug}:${String(j.id)}`,
        title: str(j.title),
        location,
        workplace: remote ? 'Remote' : '',
        remote,
        comp: '',
        url: str(j.absolute_url),
        date: str(j.updated_at),
        text: htmlToText(str(j.content)),
      };
    });
  },
};

export const SMARTRECRUITERS_PAGE = 100;

const smartrecruiters: Provider = {
  async list(slug: string): Promise<Posting[]> {
    let offset = 0;
    let total = Infinity;
    const items: Record<string, unknown>[] = [];
    while (offset < total) {
      const page = rec(
        await get(
          `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SMARTRECRUITERS_PAGE}&offset=${offset}`,
        ),
      );
      total = typeof page.totalFound === 'number' ? page.totalFound : 0;
      items.push(...arr(page.content));
      offset += SMARTRECRUITERS_PAGE;
    }
    return items
      .filter((i) => rec(i.location).remote === true)
      .map((i) => {
        const id = String(i.id);
        return {
          key: `sr:${slug}:${id}`,
          title: str(i.name),
          location: str(rec(i.location).fullLocation),
          workplace: 'Remote',
          remote: true,
          comp: '',
          url: str(i.ref),
          date: str(i.releasedDate),
          text: '',
          detailUrl: `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${id}`,
        };
      });
  },
  async detail(p: Posting): Promise<string> {
    if (!p.detailUrl) return '';
    const d = rec(await get(p.detailUrl));
    const sections = rec(rec(d.jobAd).sections);
    return ['jobDescription', 'qualifications', 'additionalInformation', 'companyDescription']
      .map((s) => htmlToText(str(rec(sections[s]).text)))
      .filter(Boolean)
      .join('\n\n');
  },
};

const lever: Provider = {
  async list(slug: string): Promise<Posting[]> {
    const b = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return arr(b).map((j) => {
      const location = str(rec(j.categories).location);
      const remote = /remote/i.test(location);
      const createdAt = typeof j.createdAt === 'number' ? j.createdAt : 0;
      return {
        key: `lever:${slug}:${String(j.id)}`,
        title: str(j.text),
        location,
        workplace: remote ? 'Remote' : '',
        remote,
        comp: formatComp(j.salaryRange),
        url: str(j.hostedUrl),
        date: createdAt ? new Date(createdAt).toISOString() : '',
        text: htmlToText(str(j.description)),
      };
    });
  },
};

export const PROVIDERS: Readonly<Record<string, Provider>> = {
  ashby,
  greenhouse,
  smartrecruiters,
  lever,
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export const providerFor = (id: string): Provider | null => PROVIDERS[id] ?? null;

// Probe every provider for a slug and return live counts, for watchlist_add.
export const probeSlug = async (slug: string): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  await Promise.all(
    Object.entries(PROVIDERS).map(async ([id, p]) => {
      try {
        const postings = await p.list(slug);
        out[id] = postings.length;
      } catch {
        // Not on this provider.
      }
    }),
  );
  return out;
};

const safe = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const postingFile = (company: string, key: string): string =>
  `${safe(company)}-${safe(key.split(':').pop() ?? key)}.txt`;

export const writePostingFile = (dir: string, company: string, p: Posting): string => {
  const header = [
    `TITLE: ${p.title}`,
    `COMPANY: ${company}`,
    `LOCATION: ${p.location}${p.workplace ? ` (${p.workplace})` : ''}`,
    `COMPENSATION: ${p.comp || 'not stated'}`,
    `URL: ${p.url}`,
    `PUBLISHED: ${p.date}`,
  ].join('\n');
  const file = postingFile(company, p.key);
  writeFileSync(join(dir, file), `${header}\n\n${p.text}\n`);
  return file;
};
