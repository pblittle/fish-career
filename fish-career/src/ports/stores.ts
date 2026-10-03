import type { CalibrationRecord } from '../domain/calibration.js';
import type { PostingId } from '../domain/posting.js';
import type { Preference } from '../domain/preferences.js';
import type { Verdict, VerdictRead } from '../domain/verdicts.js';

export interface WatchlistEntry {
  name: string;
  provider: string;
  slug: string;
}

export interface ProfileStore {
  read(): Promise<string>;
  write(content: string): Promise<void>;
}

export interface WatchlistStore {
  read(): Promise<WatchlistEntry[]>;
  write(entries: WatchlistEntry[]): Promise<void>;
}

export interface PreferencesStore {
  read(): Promise<Preference[]>;
}

// The operator's skip-titles phrases, in file order. The operator writes the
// file by hand and fish only reads it; no file means no phrases.
export interface SkipTitlesStore {
  read(): Promise<string[]>;
}

export interface PendingCalibration {
  postingIds: PostingId[];
  seed: number;
  startedAt: string;
}

export interface CalibrationStore {
  save(record: CalibrationRecord): Promise<void>;
  latest(): Promise<CalibrationRecord | null>;
  savePending(pending: PendingCalibration): Promise<void>;
  readPending(): Promise<PendingCalibration | null>;
}

// Every remote posting a poll observes is marked seen, written or not, so
// later polls deliver arrivals only; a title on the skip list is not.
// observedAt is the first-observation time, set when a posting is first
// marked seen and preserved thereafter. A posting observed but not written
// carries why in dropped; entries from before the field have observed set
// and no reason.
export type DropReason = 'thin-text' | 'out-of-window';

export interface SeenEntry {
  title: string;
  date?: string;
  file?: string;
  observed?: boolean;
  observedAt?: string;
  dropped?: DropReason;
}

export interface SeenStore {
  read(): Promise<Record<string, SeenEntry>>;
  write(seen: Record<string, SeenEntry>): Promise<void>;
}

// The operator's verdicts, keyed by posting ID. read() reports corruption
// instead of silently treating it as empty, because a verdict is human
// judgment that cannot be recomputed; save() is latest-wins for the posting.
export interface VerdictStore {
  read(): Promise<VerdictRead>;
  save(verdict: Verdict): Promise<void>;
}
