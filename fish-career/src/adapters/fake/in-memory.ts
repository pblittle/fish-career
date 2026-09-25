// In-memory adapters. Tests and the demo run the complete workflow through
// these, which is the proof that the application core does not depend on the
// filesystem, the network, or the clock.

import type { CalibrationRecord } from '../../domain/calibration.js';
import type { LedgerEntry, LedgerProvenance, LedgerRead } from '../../domain/ledger.js';
import type { Posting, PostingId, PostingRecord } from '../../domain/posting.js';
import type { Preference } from '../../domain/preferences.js';
import { createSeededRandom, type RandomSource } from '../../domain/random.js';
import type { Clock } from '../../ports/clock.js';
import type { Ledger } from '../../ports/ledger.js';
import type { PostingRepository } from '../../ports/posting-repository.js';
import type {
  CalibrationStore,
  PendingCalibration,
  PreferencesStore,
  ProfileStore,
  SeenEntry,
  SeenStore,
  WatchlistEntry,
  WatchlistStore,
} from '../../ports/stores.js';
import type { TraceReader } from '../../ports/trace-reader.js';
import type { TraceRecord, TraceSink } from '../../ports/trace-sink.js';

export const memoryProfileStore = (initial = ''): ProfileStore => {
  let value = initial;
  return {
    async read() {
      return value;
    },
    async write(content) {
      value = content;
    },
  };
};

export const memoryWatchlistStore = (initial: WatchlistEntry[] = []): WatchlistStore => {
  let entries = [...initial];
  return {
    async read() {
      return [...entries];
    },
    async write(next) {
      entries = [...next];
    },
  };
};

export const memoryPreferencesStore = (initial: Preference[] = []): PreferencesStore => ({
  async read() {
    return [...initial];
  },
});

export const memoryCalibrationStore = (): CalibrationStore & {
  records: CalibrationRecord[];
} => {
  const records: CalibrationRecord[] = [];
  let pending: PendingCalibration | null = null;
  return {
    records,
    async save(record) {
      records.push(record);
    },
    async latest() {
      return records[records.length - 1] ?? null;
    },
    async savePending(next) {
      pending = next;
    },
    async readPending() {
      return pending;
    },
  };
};

export const memorySeenStore = (initial: Record<string, SeenEntry> = {}): SeenStore => {
  let seen = { ...initial };
  return {
    async read() {
      return { ...seen };
    },
    async write(next) {
      seen = { ...next };
    },
  };
};

export const memoryLedger = (initial: Record<PostingId, LedgerEntry> = {}): Ledger => {
  const entries = { ...initial };
  return {
    async read(): Promise<LedgerRead> {
      return { ok: true, entries: { ...entries } };
    },
    async mark(scores: Record<PostingId, number>, provenance: LedgerProvenance) {
      const at = new Date().toISOString();
      for (const [id, score] of Object.entries(scores)) {
        entries[id] = {
          score: Math.round(score * 1000) / 1000,
          profileHash: provenance.profileHash,
          rubric: provenance.rubric,
          at,
        };
      }
    },
  };
};

export const memoryPostingRepository = (initial: PostingRecord[] = []): PostingRepository => {
  const records = new Map(initial.map((r) => [r.id, r]));
  const safe = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return {
    async list() {
      return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async save(company: string, posting: Posting): Promise<PostingId> {
      const id = `${safe(company)}-${safe(posting.key.split(':').pop() ?? posting.key)}`;
      // The same header format the filesystem adapter writes, so fakes and the
      // real cache are interchangeable for the judge.
      const text = [
        `TITLE: ${posting.title}`,
        `COMPANY: ${company}`,
        `LOCATION: ${posting.location}${posting.workplace ? ` (${posting.workplace})` : ''}`,
        `COMPENSATION: ${posting.comp || 'not stated'}`,
        `URL: ${posting.url}`,
        `PUBLISHED: ${posting.date}`,
        '',
        posting.text,
        '',
      ].join('\n');
      records.set(id, {
        id,
        file: `${id}.txt`,
        title: posting.title,
        company,
        location: posting.location,
        compensation: posting.comp,
        url: posting.url,
        published: posting.date,
        text,
      });
      return id;
    },
  };
};

export const memoryTraceSink = (): TraceSink & { records: TraceRecord[] } => {
  const records: TraceRecord[] = [];
  return {
    records,
    async write(record) {
      records.push(record);
    },
  };
};

export const memoryTraceReader = (
  records: TraceRecord[] = [],
): TraceReader & { records: TraceRecord[] } => ({
  records,
  async recent(limit: number) {
    if (limit <= 0) return [];
    return records.slice(-limit);
  },
  async byRun(runId: string) {
    return records.filter((record) => record.runId === runId);
  },
  async latestRun() {
    const last = records[records.length - 1];
    if (last === undefined) return null;
    return { runId: last.runId, records: records.filter((r) => r.runId === last.runId) };
  },
});

export const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

export const seededRandom = (seed: number): RandomSource => createSeededRandom(seed);
