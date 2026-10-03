// A pasted URL, read for the job board and posting it names. Pure: nothing
// here touches the network. A URL names a posting or a board on one of the
// four providers fish reads, or the answer says why fish cannot follow it:
// a system it has no adapter for, a job search site, or nothing it knows.

export type BoardProvider = 'ashby' | 'greenhouse' | 'lever' | 'smartrecruiters';

export interface Board {
  provider: string;
  slug: string;
}

export type UrlTarget =
  | { kind: 'posting'; provider: BoardProvider; slug: string; jobId: string }
  | { kind: 'board'; provider: BoardProvider; slug: string }
  // A Greenhouse job embedded on the employer's own site (gh_jid). Greenhouse
  // job IDs are global, but the URL does not say which board carries it.
  | { kind: 'job'; provider: 'greenhouse'; jobId: string }
  | { kind: 'unsupported'; system: string }
  | { kind: 'aggregator'; site: string }
  | { kind: 'unknown' };

// The key prefix each adapter writes (src/adapters/ats/providers.ts). The
// adapter tests parse every URL an adapter produces back to the key it
// wrote, so the two cannot drift apart without failing CI.
const KEY_PREFIX: Readonly<Record<BoardProvider, string>> = {
  ashby: 'ashby',
  greenhouse: 'gh',
  lever: 'lever',
  smartrecruiters: 'sr',
};

// Boards on systems fish has no adapter for, by domain. Every entry has a
// recorded URL in src/fixtures/posting-urls.json.
export const OTHER_SYSTEMS: readonly (readonly [domain: string, system: string])[] = [
  ['myworkdayjobs.com', 'Workday'],
  ['icims.com', 'iCIMS'],
  ['zohorecruit.com', 'Zoho Recruit'],
  ['breezy.hr', 'Breezy HR'],
  ['teamtailor.com', 'Teamtailor'],
  ['applytojob.com', 'JazzHR'],
  ['bamboohr.com', 'BambooHR'],
  ['recruitee.com', 'Recruitee'],
  ['ats.rippling.com', 'Rippling'],
  ['hrmdirect.com', 'HRM Direct'],
  ['ultipro.com', 'UKG'],
  ['dayforcehcm.com', 'Dayforce'],
  ['jobs.deel.com', 'Deel'],
  ['careerpuck.com', 'CareerPuck'],
  ['ycombinator.com', 'YC Work at a Startup'],
];

// Job search sites that list other employers' postings, by domain.
export const AGGREGATORS: readonly (readonly [domain: string, site: string])[] = [
  ['hiringcafe.com', 'HiringCafe'],
  ['hiring.cafe', 'HiringCafe'],
  ['indeed.com', 'Indeed'],
  ['linkedin.com', 'LinkedIn'],
  ['remotive.com', 'Remotive'],
  ['monster.com', 'Monster'],
  ['dice.com', 'Dice'],
  ['simplify.jobs', 'Simplify'],
];

const UNKNOWN: UrlTarget = { kind: 'unknown' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d+$/;

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// Scraped pages HTML-escape the ampersand, so a URL copied out of one may
// carry "&amp;". A URL pasted without its scheme is read as https.
const toUrl = (text: string): URL | null => {
  const trimmed = text.trim().replaceAll('&amp;', '&');
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
};

const posting = (provider: BoardProvider, slug: string, jobId: string): UrlTarget => ({
  kind: 'posting',
  provider,
  slug,
  jobId,
});

const board = (provider: BoardProvider, slug: string): UrlTarget => ({
  kind: 'board',
  provider,
  slug,
});

// Ashby and Lever: /{slug} is the board; /{slug}/{uuid}, with or without an
// /application or /apply page after it, is a posting.
const slugThenUuid = (provider: BoardProvider, rest: string[]): UrlTarget | null => {
  const [slug, jobId] = rest;
  if (!slug) return null;
  return jobId && UUID.test(jobId) ? posting(provider, slug, jobId) : board(provider, slug);
};

// Greenhouse: /{slug} is the board, /{slug}/jobs/{id} a posting.
const slugThenJobs = (provider: BoardProvider, rest: string[]): UrlTarget | null => {
  const [slug, jobs, jobId] = rest;
  if (!slug) return null;
  return jobs === 'jobs' && jobId && DIGITS.test(jobId)
    ? posting(provider, slug, jobId)
    : board(provider, slug);
};

const ashby = (host: string, path: string[]): UrlTarget | null => {
  if (host === 'jobs.ashbyhq.com') return slugThenUuid('ashby', path);
  if (host === 'api.ashbyhq.com' && path[0] === 'posting-api' && path[1] === 'job-board') {
    return path[2] ? board('ashby', path[2]) : null;
  }
  return null;
};

const greenhouse = (host: string, path: string[], query: URLSearchParams): UrlTarget | null => {
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    if (path[0] !== 'embed') return slugThenJobs('greenhouse', path);
    // The embedded board names the slug in ?for= and the job in ?token=.
    const slug = query.get('for');
    if (!slug) return null;
    const token = query.get('token');
    return token && DIGITS.test(token)
      ? posting('greenhouse', slug, token)
      : board('greenhouse', slug);
  }
  if (host === 'boards-api.greenhouse.io' && path[0] === 'v1' && path[1] === 'boards') {
    return slugThenJobs('greenhouse', path.slice(2));
  }
  return null;
};

const lever = (host: string, path: string[]): UrlTarget | null => {
  if (host === 'jobs.lever.co') return slugThenUuid('lever', path);
  if (host === 'api.lever.co' && path[0] === 'v0' && path[1] === 'postings') {
    return slugThenUuid('lever', path.slice(2));
  }
  return null;
};

const smartrecruiters = (host: string, path: string[]): UrlTarget | null => {
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') {
    // A referral link names the company and a publication, not the posting id.
    if (path[0] === 'external-referrals') {
      return path[1] === 'company' && path[2] ? board('smartrecruiters', path[2]) : null;
    }
    const [company, page] = path;
    if (!company) return null;
    // /{company}/{id}-{title}: the posting id leads the page name.
    const jobId = page?.match(/^(\d+)(?:-|$)/)?.[1];
    return jobId ? posting('smartrecruiters', company, jobId) : board('smartrecruiters', company);
  }
  if (host === 'api.smartrecruiters.com' && path[0] === 'v1' && path[1] === 'companies') {
    const [company, postings, jobId] = path.slice(2);
    if (!company) return null;
    return postings === 'postings' && jobId && DIGITS.test(jobId)
      ? posting('smartrecruiters', company, jobId)
      : board('smartrecruiters', company);
  }
  return null;
};

const onDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

const named = (host: string, table: readonly (readonly [string, string])[]): string | undefined =>
  table.find(([domain]) => onDomain(host, domain))?.[1];

export const parsePostingUrl = (text: string): UrlTarget => {
  const url = toUrl(text);
  if (!url) return UNKNOWN;
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.split('/').filter(Boolean).map(decode);
  const query = url.searchParams;
  const onBoard =
    ashby(host, path) ??
    greenhouse(host, path, query) ??
    lever(host, path) ??
    smartrecruiters(host, path);
  if (onBoard) return onBoard;
  const ghJid = query.get('gh_jid');
  if (ghJid && DIGITS.test(ghJid)) return { kind: 'job', provider: 'greenhouse', jobId: ghJid };
  const system = named(host, OTHER_SYSTEMS);
  if (system) return { kind: 'unsupported', system };
  const site = named(host, AGGREGATORS);
  if (site) return { kind: 'aggregator', site };
  return UNKNOWN;
};

// The board APIs disagree about case. On 2026-10-03 Ashby, Greenhouse, and
// SmartRecruiters listed the same postings for "Deepgram" and "deepgram",
// "Honor" and "honor", "ServiceNow" and "servicenow", while Lever answered
// "Document not found" for "Vida", "Anchorage", and "MoonPay". So a slug
// compares URL-decoded everywhere, and case-blind everywhere but Lever.
const CASE_SENSITIVE: ReadonlySet<string> = new Set(['lever']);

const slugOf = (provider: string, slug: string): string => {
  const decoded = decode(slug.trim());
  return CASE_SENSITIVE.has(provider) ? decoded : decoded.toLowerCase();
};

export const sameBoard = (a: Board, b: Board): boolean =>
  a.provider === b.provider && slugOf(a.provider, a.slug) === slugOf(b.provider, b.slug);

export const postingKey = (p: { provider: BoardProvider; slug: string; jobId: string }): string =>
  `${KEY_PREFIX[p.provider]}:${p.slug}:${p.jobId}`;

// Whether a posting key, as an adapter wrote it from the watched slug, is the
// posting this URL names. A Greenhouse job on an employer's own site matches
// that job on any watched Greenhouse board.
export const matchesKey = (target: UrlTarget, key: string): boolean => {
  const [prefix, slug, ...rest] = key.split(':');
  const jobId = rest.join(':');
  if (slug === undefined || !jobId) return false;
  if (target.kind === 'posting') {
    return (
      prefix === KEY_PREFIX[target.provider] &&
      jobId === target.jobId &&
      sameBoard({ provider: target.provider, slug }, target)
    );
  }
  if (target.kind === 'job')
    return prefix === KEY_PREFIX[target.provider] && jobId === target.jobId;
  return false;
};
