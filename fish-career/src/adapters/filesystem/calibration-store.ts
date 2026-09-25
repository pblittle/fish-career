import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CalibrationRecord } from '../../domain/calibration.js';
import type { PostingId } from '../../domain/posting.js';
import type { CalibrationStore, PendingCalibration } from '../../ports/stores.js';
import { type HomePaths, readJson, writeJson } from './home.js';

// Records written before stable posting IDs used `files`; normalize on read
// so a calibration history survives the rename.
const normalizeRecord = (raw: unknown): CalibrationRecord | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const ids = Array.isArray(r.postingIds) ? r.postingIds : Array.isArray(r.files) ? r.files : null;
  if (ids === null || !Array.isArray(r.humanRanking) || !Array.isArray(r.rows)) return null;
  const rows = r.rows.map((row) => {
    if (typeof row !== 'object' || row === null) return row;
    const rec = row as Record<string, unknown>;
    return rec.postingId === undefined && typeof rec.file === 'string'
      ? { ...rec, postingId: String(rec.file).replace(/\.(txt|md)$/i, '') }
      : rec;
  });
  return {
    at: typeof r.at === 'string' ? r.at : '',
    postingIds: ids.map((id) => String(id).replace(/\.(txt|md)$/i, '')) as PostingId[],
    humanRanking: r.humanRanking.map((id) => String(id).replace(/\.(txt|md)$/i, '')) as PostingId[],
    rho: typeof r.rho === 'number' ? r.rho : null,
    rows: rows as CalibrationRecord['rows'],
  };
};

const normalizePending = (raw: unknown): PendingCalibration | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const ids = Array.isArray(p.postingIds) ? p.postingIds : Array.isArray(p.files) ? p.files : null;
  if (ids === null) return null;
  return {
    postingIds: ids.map((id) => String(id).replace(/\.(txt|md)$/i, '')),
    seed: typeof p.seed === 'number' ? p.seed : 0,
    startedAt: typeof p.startedAt === 'string' ? p.startedAt : '',
  };
};

export const fileCalibrationStore = (paths: HomePaths): CalibrationStore => ({
  async save(record: CalibrationRecord): Promise<void> {
    mkdirSync(paths.calibrations, { recursive: true });
    const name = `${record.at.replace(/[:.]/g, '-')}.json`;
    writeJson(join(paths.calibrations, name), record);
  },
  async latest(): Promise<CalibrationRecord | null> {
    try {
      const names = readdirSync(paths.calibrations)
        .filter((n) => n.endsWith('.json'))
        .sort();
      const newest = names[names.length - 1];
      if (newest === undefined) return null;
      return normalizeRecord(JSON.parse(readFileSync(join(paths.calibrations, newest), 'utf8')));
    } catch {
      return null;
    }
  },
  async savePending(pending: PendingCalibration): Promise<void> {
    writeJson(paths.calibrationPending, pending);
  },
  async readPending(): Promise<PendingCalibration | null> {
    return normalizePending(readJson<unknown>(paths.calibrationPending, null));
  },
});
