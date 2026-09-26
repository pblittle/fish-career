// The application the example orchestrates. Fake mode is the default: an
// in-memory board and the deterministic stand-in judge, so the example runs
// with no network and no API key. Live mode talks to the real thing through
// the same application API.

import {
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memoryTraceReader,
  memoryTraceSink,
  memoryWatchlistStore,
} from 'fish-career/dist/adapters/fake/in-memory.js';
import { memoryProvider } from 'fish-career/dist/adapters/fake/providers.js';
import { fakeJudge } from 'fish-career/dist/adapters/judge/fake.js';
import {
  type CareerApplication,
  createApplication,
} from 'fish-career/dist/application/career-application.js';
import type { CareerDependencies } from 'fish-career/dist/application/dependencies.js';
import { createApplicationFromHome } from 'fish-career/dist/bootstrap/create-application.js';
import type { Posting } from 'fish-career/dist/domain/posting.js';
import { createSeededRandom } from 'fish-career/dist/domain/random.js';
import { systemClock } from 'fish-career/dist/ports/clock.js';

const FIXTURE_PROFILE = [
  'Senior platform / forward-deployed engineer, individual contributor.',
  'Remote US only; not open to relocation.',
  'Compensation floor: $170,000.',
  'Core skills: TypeScript, Python, Kubernetes, Terraform, AWS, LangChain, LangGraph, Postgres.',
  'Domains I want: AI infrastructure, developer tools.',
].join('\n');

const body = (extra = '') =>
  `TypeScript, Node.js, Postgres, AWS, and distributed systems. ${extra}`.padEnd(120, ' ');

const posting = (key: string, title: string, over: Partial<Posting> = {}): Posting => ({
  key,
  title,
  location: 'Remote (US)',
  workplace: 'Remote',
  remote: true,
  comp: '$200,000 – $240,000',
  url: `https://example.com/${key}`,
  date: '2026-09-20T00:00:00Z',
  text: body(),
  ...over,
});

const board = (): Record<string, Posting[]> => ({
  northwind: [
    posting('example:northwind:1', 'Senior Backend Engineer'),
    posting('example:northwind:2', 'Staff Platform Engineer', { text: body('Developer tooling.') }),
    posting('example:northwind:3', 'Junior Backend Engineer', {
      comp: '$110,000 – $130,000',
      text: body('Junior role.'),
    }),
    posting('example:northwind:4', 'Onsite Platform Engineer', {
      location: 'Austin, TX',
      workplace: '',
      text: body('This role is on-site in Austin; there is no remote option.'),
    }),
  ],
});

export const fakeApplication = (): CareerApplication => {
  const traces = memoryTraceSink();
  const deps: CareerDependencies = {
    providers: { fixture: memoryProvider('fixture', board()) },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen: memorySeenStore(),
    ledger: memoryLedger(),
    traces,
    traceReader: memoryTraceReader(traces.records),
    profile: memoryProfileStore(FIXTURE_PROFILE),
    watchlist: memoryWatchlistStore([
      { name: 'Northwind Labs', provider: 'fixture', slug: 'northwind' },
    ]),
    preferences: memoryPreferencesStore([]),
    calibrations: memoryCalibrationStore(),
    clock: systemClock,
    random: createSeededRandom(20260925),
    version: 'langgraph-example',
  };
  return createApplication(deps);
};

// Live mode: the operator's own FISH_HOME, the real ATS boards, and the real
// judge. Requires FISH_HOME (and a TypeSafe key) to be configured, or
// FISH_JUDGE=fake to keep the judge free while using real postings.
export const liveApplication = (): CareerApplication => createApplicationFromHome();
