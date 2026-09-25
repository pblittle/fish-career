// Where fish reads and writes. Everything hangs off one home directory so the
// npm package itself stays stateless; the default is ~/.config/fish and
// FISH_HOME overrides it for tests, worktrees, and private state checkouts.
// The paths are built by function, not at import, so a test or a second
// workspace can point at its own home without module-load order games.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface HomePaths {
  home: string;
  profile: string;
  watchlist: string;
  preferences: string;
  postings: string;
  env: string;
  state: string;
  ledger: string;
  traces: string;
  seen: string;
  calibrations: string;
  calibrationPending: string;
}

export const defaultHome = (): string =>
  process.env.FISH_HOME ?? join(homedir(), '.config', 'fish');

export const homePaths = (home: string): HomePaths => {
  const state = join(home, 'state');
  return {
    home,
    profile: join(home, 'profile.md'),
    watchlist: join(home, 'watchlist.json'),
    preferences: join(home, 'preferences.json'),
    postings: join(home, 'postings'),
    env: join(home, '.env'),
    state,
    ledger: join(state, 'scored.json'),
    traces: join(state, 'traces.jsonl'),
    seen: join(state, 'seen.json'),
    calibrations: join(state, 'calibrations'),
    calibrationPending: join(state, 'calibration-pending.json'),
  };
};

export const ensureHome = (paths: HomePaths): void => {
  mkdirSync(paths.postings, { recursive: true });
  mkdirSync(paths.state, { recursive: true });
};

export const loadEnv = (paths: HomePaths): void => {
  try {
    process.loadEnvFile(paths.env);
  } catch {
    // No .env in the config dir; the key may be in the environment.
  }
};

export const readJson = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

// Write-to-temp-then-rename: a crash mid-write leaves the old file intact
// instead of a truncated one. rename(2) is atomic on one disk.
export const writeFileAtomic = (path: string, data: string): void => {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
};

export const writeJson = (path: string, value: unknown): void => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileAtomic(path, JSON.stringify(value, null, 2));
};

export const hasApiKey = (): boolean =>
  Boolean(process.env.TYPESAFE_API_KEY && !process.env.TYPESAFE_API_KEY.includes('your-key'));
