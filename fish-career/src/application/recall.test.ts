import { describe, expect, it, vi } from 'vitest';
import {
  fixedClock,
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memorySkipTitlesStore,
  memoryTraceReader,
  memoryTraceSink,
  memoryVerdictStore,
  memoryWatchlistStore,
} from '../adapters/fake/in-memory.js';
import { memoryProvider } from '../adapters/fake/providers.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import type { Posting } from '../domain/posting.js';
import type { CareerDependencies } from './dependencies.js';
import { fetchPostings } from './fetch-postings.js';
import { recallPostings } from './recall.js';

const NOW = '2026-10-03T12:00:00.000Z';
const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * DAY).toISOString();

// Synthetic job IDs in the UUID shape Lever and Ashby use.
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Postings keyed and linked the way the Lever and Greenhouse adapters write
// them, so a URL a person pasted can be matched to what fish saw.
const vidaPosting = (n: number, over: Partial<Posting> = {}): Posting => ({
  key: `lever:vida:${uuid(n)}`,
  title: `Vida role ${n}`,
  location: 'United States',
  workplace: 'Remote',
  remote: true,
  comp: '',
  url: `https://jobs.lever.co/vida/${uuid(n)}`,
  date: daysAgo(1),
  text: 'x'.repeat(200),
  ...over,
});

const honorPosting = (id: string): Posting => ({
  key: `gh:honor:${id}`,
  title: `Honor role ${id}`,
  location: 'Remote Position',
  workplace: 'Remote',
  remote: true,
  comp: '',
  url: `https://boards.greenhouse.io/honor/jobs/${id}?gh_jid=${id}`,
  date: daysAgo(1),
  text: 'y'.repeat(200),
});

const harness = () => {
  const vida = [
    vidaPosting(1),
    vidaPosting(2, { text: 'too short' }),
    vidaPosting(3, { date: daysAgo(30) }),
    vidaPosting(4, { workplace: 'Hybrid', remote: false }),
  ];
  const lever = memoryProvider('lever', { vida });
  const traces = memoryTraceSink();
  const deps: CareerDependencies = {
    providers: {
      lever,
      greenhouse: memoryProvider('greenhouse', { honor: [honorPosting('8297124002')] }),
      ashby: memoryProvider('ashby', {}),
    },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen: memorySeenStore(),
    verdicts: memoryVerdictStore(),
    ledger: memoryLedger({
      [`vida-${uuid(1)}`]: { score: 0.71, profileHash: 'p', rubric: 1 },
    }),
    traces,
    traceReader: memoryTraceReader(traces.records),
    profile: memoryProfileStore('Remote US only.'),
    watchlist: memoryWatchlistStore([
      { name: 'Vida', provider: 'lever', slug: 'vida' },
      { name: 'Honor', provider: 'greenhouse', slug: 'honor' },
      { name: 'Gone', provider: 'lever', slug: 'gone' },
    ]),
    preferences: memoryPreferencesStore(),
    calibrations: memoryCalibrationStore(),
    clock: fixedClock(NOW),
    random: { int: () => 0, shuffle: (xs) => [...xs] },
  };
  return { deps, vida, lever };
};

// A first poll writes posting 1, drops 2 as thin and 3 as out of window, and
// skips 4 as hybrid; posting 5 goes up on the board after the poll.
const afterFirstPoll = async () => {
  const h = harness();
  await fetchPostings(h.deps)({});
  h.vida.push(vidaPosting(5));
  return h;
};

describe('recallPostings, the known-item case log', () => {
  it('reports the furthest stage each posting reached', async () => {
    const h = await afterFirstPoll();
    const cases = await recallPostings(h.deps)({
      urls: [
        `https://jobs.lever.co/vida/${uuid(1)}`,
        `https://jobs.lever.co/vida/${uuid(2)}?lever-source=Indeed`,
        `https://jobs.lever.co/vida/${uuid(3)}`,
        `https://jobs.lever.co/vida/${uuid(4)}`,
        `https://jobs.lever.co/vida/${uuid(5)}/apply`,
        `https://jobs.lever.co/vida/${uuid(6)}`,
      ],
    });
    expect(cases).toEqual([
      {
        url: `https://jobs.lever.co/vida/${uuid(1)}`,
        stage: 'written',
        company: 'Vida',
        title: 'Vida role 1',
        postingId: `vida-${uuid(1)}`,
        score: 0.71,
      },
      {
        url: `https://jobs.lever.co/vida/${uuid(2)}?lever-source=Indeed`,
        stage: 'dropped',
        company: 'Vida',
        title: 'Vida role 2',
        reason: 'thin-text',
        observedAt: NOW,
      },
      {
        url: `https://jobs.lever.co/vida/${uuid(3)}`,
        stage: 'dropped',
        company: 'Vida',
        title: 'Vida role 3',
        reason: 'out-of-window',
        observedAt: NOW,
      },
      {
        url: `https://jobs.lever.co/vida/${uuid(4)}`,
        stage: 'not-remote',
        company: 'Vida',
        title: 'Vida role 4',
        workplace: 'Hybrid',
        location: 'United States',
      },
      {
        url: `https://jobs.lever.co/vida/${uuid(5)}/apply`,
        stage: 'not-fetched',
        company: 'Vida',
        title: 'Vida role 5',
      },
      { url: `https://jobs.lever.co/vida/${uuid(6)}`, stage: 'not-listed', company: 'Vida' },
    ]);
  });

  it('names the skip-titles phrase that keeps a listed remote posting out', async () => {
    const h = await afterFirstPoll();
    h.vida.push(
      vidaPosting(7, { title: 'Product Designer II' }),
      vidaPosting(8, { title: 'Product Designer III', workplace: 'Hybrid', remote: false }),
    );
    h.deps.skipTitles = memorySkipTitlesStore(['designer']);
    const cases = await recallPostings(h.deps)({
      urls: [
        `https://jobs.lever.co/vida/${uuid(7)}`,
        `https://jobs.lever.co/vida/${uuid(8)}`,
        `https://jobs.lever.co/vida/${uuid(1)}`,
      ],
    });
    // Fetch's order: the remote check first, then the skip list. A posting
    // already written stays written whatever the list says now.
    expect(cases.map(({ url: _url, ...rest }) => rest)).toEqual([
      { stage: 'off-target', company: 'Vida', title: 'Product Designer II', phrase: 'designer' },
      {
        stage: 'not-remote',
        company: 'Vida',
        title: 'Product Designer III',
        workplace: 'Hybrid',
        location: 'United States',
      },
      {
        stage: 'written',
        company: 'Vida',
        title: 'Vida role 1',
        postingId: `vida-${uuid(1)}`,
        score: 0.71,
      },
    ]);
  });

  it('says where fish cannot follow a URL at all', async () => {
    const h = await afterFirstPoll();
    const cases = await recallPostings(h.deps)({
      urls: [
        `https://jobs.ashbyhq.com/deepgram/${uuid(7)}`,
        'https://jobs.lever.co/vida',
        'https://teladoc.wd503.myworkdayjobs.com/en-US/teladochealth_is_hiring',
        'https://www.indeed.com/viewjob?jk=9d6c8e3a01cfc4b9',
        'https://www.atlassian.com/company/careers/details/25780',
      ],
    });
    expect(cases.map(({ url: _url, ...rest }) => rest)).toEqual([
      { stage: 'not-watched', names: 'ashby/deepgram' },
      { stage: 'board-url', names: 'lever/vida', company: 'Vida' },
      { stage: 'other-system', names: 'Workday' },
      { stage: 'job-site', names: 'Indeed' },
      { stage: 'unknown' },
    ]);
  });

  it('reports a watched board it could not read, rather than guessing', async () => {
    const h = await afterFirstPoll();
    const [gone] = await recallPostings(h.deps)({
      urls: [`https://jobs.lever.co/gone/${uuid(8)}`],
    });
    expect(gone).toMatchObject({
      stage: 'unreadable',
      company: 'Gone',
      error: 'no board gone on lever',
    });
  });

  it('follows a Greenhouse job on an employer site to the watched board that carries it', async () => {
    const h = await afterFirstPoll();
    const cases = await recallPostings(h.deps)({
      urls: [
        'https://careers.example.com/jobs?gh_jid=8297124002',
        'https://careers.example.com/jobs?gh_jid=1234',
      ],
    });
    expect(cases.map(({ url: _url, ...rest }) => rest)).toEqual([
      {
        stage: 'written',
        company: 'Honor',
        title: 'Honor role 8297124002',
        postingId: 'honor-8297124002',
        score: null,
      },
      { stage: 'not-listed', names: 'greenhouse', checked: ['Honor'] },
    ]);
  });

  it('calls a Greenhouse job unwatched when no Greenhouse board is', async () => {
    const h = harness();
    await h.deps.watchlist.write([{ name: 'Vida', provider: 'lever', slug: 'vida' }]);
    const [job] = await recallPostings(h.deps)({
      urls: ['https://careers.example.com/jobs?gh_jid=8297124002'],
    });
    expect(job).toMatchObject({ stage: 'not-watched', names: 'greenhouse' });
  });

  it('reads each watched board at most once per run', async () => {
    const h = await afterFirstPoll();
    const list = vi.spyOn(h.lever, 'list');
    await recallPostings(h.deps)({
      urls: [
        `https://jobs.lever.co/vida/${uuid(4)}`,
        `https://jobs.lever.co/vida/${uuid(5)}`,
        `https://jobs.lever.co/vida/${uuid(6)}`,
        `https://jobs.lever.co/vida/${uuid(1)}`,
      ],
    });
    // Postings 4 to 6 need the live board; posting 1 is answered by the
    // seen index alone.
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('vida');
  });

  it('keeps a dropped posting from before the reason was recorded as dropped, reason unknown', async () => {
    const h = harness();
    await h.deps.seen.write({
      [`lever:vida:${uuid(2)}`]: { title: 'Vida role 2', observed: true },
    });
    const [dropped] = await recallPostings(h.deps)({
      urls: [`https://jobs.lever.co/vida/${uuid(2)}`],
    });
    expect(dropped).toEqual({
      url: `https://jobs.lever.co/vida/${uuid(2)}`,
      stage: 'dropped',
      company: 'Vida',
      title: 'Vida role 2',
    });
  });
});
