import { PROVIDERS } from '../adapters/ats/providers.js';
import { fileCalibrationStore } from '../adapters/filesystem/calibration-store.js';
import {
  defaultHome,
  ensureHome,
  hasApiKey,
  homePaths,
  loadEnv,
} from '../adapters/filesystem/home.js';
import { fileLedger } from '../adapters/filesystem/ledger.js';
import { filePostingRepository } from '../adapters/filesystem/posting-repository.js';
import { filePreferencesStore } from '../adapters/filesystem/preferences-store.js';
import { fileProfileStore } from '../adapters/filesystem/profile-store.js';
import { fileSeenStore } from '../adapters/filesystem/seen-store.js';
import { jsonlTraceReader } from '../adapters/filesystem/trace-reader.js';
import { jsonlTraceSink } from '../adapters/filesystem/trace-sink.js';
import { fileWatchlistStore } from '../adapters/filesystem/watchlist-store.js';
import { fakeJudge } from '../adapters/judge/fake.js';
import { JevJudge } from '../adapters/judge/jev.js';
import { type CareerApplication, createApplication } from '../application/career-application.js';
import type { CareerDependencies } from '../application/dependencies.js';
import { systemRandom } from '../domain/random.js';
import type { AtsProviders } from '../ports/ats-provider.js';
import { systemClock } from '../ports/clock.js';
import type { Judge } from '../ports/judge.js';

export interface CreateApplicationOptions {
  home?: string;
  judge?: Judge | null;
  providers?: AtsProviders;
  dependencies?: Partial<CareerDependencies>;
  loadDotEnv?: boolean;
}

const selectJudge = (): Judge | null => {
  if (process.env.FISH_JUDGE === 'fake') return fakeJudge;
  if (hasApiKey()) return new JevJudge();
  return null;
};

// The composition root: the only place that knows the filesystem, the ATS
// registry, and the judge exist. Everything above it takes ports.
export const createApplicationFromHome = (
  opts: CreateApplicationOptions = {},
): CareerApplication => {
  const paths = homePaths(opts.home ?? defaultHome());
  ensureHome(paths);
  if (opts.loadDotEnv !== false) loadEnv(paths);
  const deps: CareerDependencies = {
    providers: opts.providers ?? PROVIDERS,
    judge: opts.judge !== undefined ? opts.judge : selectJudge(),
    postings: filePostingRepository(paths.postings),
    seen: fileSeenStore(paths),
    ledger: fileLedger(paths.ledger),
    traces: jsonlTraceSink(paths.traces),
    traceReader: jsonlTraceReader(paths.traces),
    profile: fileProfileStore(paths),
    watchlist: fileWatchlistStore(paths),
    preferences: filePreferencesStore(paths),
    calibrations: fileCalibrationStore(paths),
    clock: systemClock,
    random: systemRandom,
    ...opts.dependencies,
  };
  return createApplication(deps);
};
