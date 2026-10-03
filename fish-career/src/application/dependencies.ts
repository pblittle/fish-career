// Everything a use case may reach for, stated once. The application never
// imports a filesystem, a network client, or a global; bootstrap wires the
// real adapters and tests wire fakes.

import type { RandomSource } from '../domain/random.js';
import type { AtsProviders } from '../ports/ats-provider.js';
import type { Clock } from '../ports/clock.js';
import type { Judge } from '../ports/judge.js';
import type { Ledger } from '../ports/ledger.js';
import type { PostingRepository } from '../ports/posting-repository.js';
import type {
  CalibrationStore,
  PreferencesStore,
  ProfileStore,
  SeenStore,
  SkipTitlesStore,
  VerdictStore,
  WatchlistStore,
} from '../ports/stores.js';
import type { TraceReader } from '../ports/trace-reader.js';
import type { TraceSink } from '../ports/trace-sink.js';

export interface CareerDependencies {
  providers: AtsProviders;
  // Null when no judge is configured: use cases that need one fail with a
  // stable code instead of discovering it mid-run.
  judge: Judge | null;
  postings: PostingRepository;
  seen: SeenStore;
  verdicts: VerdictStore;
  ledger: Ledger;
  traces: TraceSink;
  traceReader: TraceReader;
  profile: ProfileStore;
  watchlist: WatchlistStore;
  preferences: PreferencesStore;
  // Titles fetch never writes. Without a store, no title is skipped.
  skipTitles?: SkipTitlesStore;
  calibrations: CalibrationStore;
  clock: Clock;
  random: RandomSource;
  // The application version stamped on traces, so a run says which build
  // produced it.
  version?: string;
}
