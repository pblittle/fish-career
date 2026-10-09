// The four public ATS APIs, mapped to one flat posting shape. Board
// verification lives in the application (probeCompany) so the adapters stay
// pure translations of a provider's wire format.

import type { Posting } from '../../domain/posting.js';
import type { AtsProvider } from '../../ports/ats-provider.js';

export const REQUEST_TIMEOUT_MS = 20_000;

const get = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
};

// The parse edge for all four boards: narrow the unknown JSON to the few
// fields a Posting is built from, tolerating absence with defaults rather
// than crashing. A schema change upstream degrades one field to empty, not
// the whole poll to a mystery failure.
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

// Pay-transparency text often states a range the structured field omits:
// 14 cached Ashby postings had an empty compensation object and a band in
// the body. When a provider sends nothing structured, lift the first stated
// range from the body, verbatim, so the header shows the posting's own words.
// A lone figure is never lifted ("$400M in ARR" is not a salary), and a range
// below the annual floor is skipped ("$10,000 to $20,000 stipend" is not
// either). This is adapter-side translation of the wire text, not scoring:
// the judge reads the body regardless.
const AMOUNT = String.raw`\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?[Kk]`;
const CURRENCY = String.raw`US\$|\$|USD|CAD|EUR|GBP|€|£`;
const RANGE = new RegExp(
  String.raw`(?:${CURRENCY})\s?(${AMOUNT})(?:\s?(?:${CURRENCY}))?\s?(?:-|–|—|to|and)\s?(?:${CURRENCY})?\s?(${AMOUNT})(?:\s?(?:${CURRENCY}))?`,
  'g',
);
const ANNUAL_FLOOR = 20_000;

const amount = (s: string): number =>
  /[Kk]$/.test(s) ? Number(s.slice(0, -1)) * 1000 : Number(s.replace(/,/g, ''));

export const compFromText = (text: string): string => {
  for (const m of text.matchAll(RANGE)) {
    if (amount(m[1] ?? '') >= ANNUAL_FLOOR) return m[0].trim();
  }
  return '';
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

const ashby: AtsProvider = {
  id: 'ashby',
  async list(slug: string): Promise<Posting[]> {
    const b = rec(
      await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`),
    );
    return arr(b.jobs).map((j) => {
      const jobUrl = str(j.jobUrl);
      const title = str(j.title);
      // workplaceType is the stated policy. isRemote is set on hybrid
      // postings too (all 518 of OpenAI's on 2026-10-03), so it decides only
      // when the policy is absent.
      const workplace = str(j.workplaceType);
      const text = str(j.descriptionPlain) || htmlToText(str(j.descriptionHtml));
      return {
        key: `ashby:${slug}:${jobUrl.split('/').pop() || title}`,
        title,
        location: str(j.location),
        workplace,
        remote: workplace ? workplace === 'Remote' : j.isRemote === true,
        comp:
          str(rec(j.compensation).compensationTierSummary) ||
          str(j.compensationTierSummary) ||
          compFromText(text),
        url: jobUrl,
        date: str(j.publishedAt),
        text,
      };
    });
  },
};

const greenhouse: AtsProvider = {
  id: 'greenhouse',
  async list(slug: string): Promise<Posting[]> {
    const b = rec(
      await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`),
    );
    return arr(b.jobs).map((j) => {
      const location = str(rec(j.location).name);
      const remote = /remote/i.test(location);
      const text = htmlToText(str(j.content));
      return {
        key: `gh:${slug}:${String(j.id)}`,
        title: str(j.title),
        location,
        workplace: remote ? 'Remote' : '',
        remote,
        comp: compFromText(text),
        url: str(j.absolute_url),
        // first_published is when the posting went up; updated_at moves on
        // every edit, so it would pass month-old postings off as new.
        date: str(j.first_published) || str(j.updated_at),
        text,
      };
    });
  },
};

export const SMARTRECRUITERS_PAGE = 100;

const smartrecruiters: AtsProvider = {
  id: 'smartrecruiters',
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
          // The body arrives from detail() after admission, so no text
          // fallback here; SmartRecruiters stays "not stated" unless the
          // list payload ever carries compensation.
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

// Lever states the policy in workplaceType. The location is free text that
// often omits it ("United States" on a remote posting) or contradicts it
// ("Canada - Remote" on a hybrid one), so it decides only when the policy is
// absent or unspecified.
const LEVER_WORKPLACE: ReadonlyMap<string, string> = new Map([
  ['remote', 'Remote'],
  ['hybrid', 'Hybrid'],
  ['onsite', 'On-site'],
  ['on-site', 'On-site'],
]);

const lever: AtsProvider = {
  id: 'lever',
  async list(slug: string): Promise<Posting[]> {
    const b = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return arr(b).map((j) => {
      const location = str(rec(j.categories).location);
      const stated = LEVER_WORKPLACE.get(str(j.workplaceType).toLowerCase()) ?? '';
      const remote = stated ? stated === 'Remote' : /remote/i.test(location);
      const createdAt = typeof j.createdAt === 'number' ? j.createdAt : 0;
      const text = htmlToText(str(j.description));
      return {
        key: `lever:${slug}:${String(j.id)}`,
        title: str(j.text),
        location,
        workplace: stated || (remote ? 'Remote' : ''),
        remote,
        comp: formatComp(j.salaryRange) || compFromText(text),
        url: str(j.hostedUrl),
        date: createdAt ? new Date(createdAt).toISOString() : '',
        text,
      };
    });
  },
};

export const PROVIDERS: Readonly<Record<string, AtsProvider>> = {
  ashby,
  greenhouse,
  smartrecruiters,
  lever,
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export const providerFor = (id: string): AtsProvider | null => PROVIDERS[id] ?? null;
