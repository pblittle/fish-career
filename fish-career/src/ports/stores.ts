import type { CalibrationRecord } from '../domain/calibration.js';
import type { PostingId } from '../domain/posting.js';
import type { Preference } from '../domain/preferences.js';

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
// later polls deliver arrivals only.
export interface SeenEntry {
  title: string;
  date?: string;
  file?: string;
  observed?: boolean;
}

export interface SeenStore {
  read(): Promise<Record<string, SeenEntry>>;
  write(seen: Record<string, SeenEntry>): Promise<void>;
}
