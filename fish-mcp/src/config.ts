// Config discovery: everything fish reads and writes lives in one home
// directory, so the npm package itself stays stateless. Default is
// ~/.config/fish; FISH_HOME overrides for tests and worktrees.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FISH_HOME = process.env.FISH_HOME ?? join(homedir(), '.config', 'fish');

export const PATHS = {
  home: FISH_HOME,
  profile: join(FISH_HOME, 'profile.md'),
  watchlist: join(FISH_HOME, 'watchlist.json'),
  postings: join(FISH_HOME, 'postings'),
  env: join(FISH_HOME, '.env'),
  state: join(FISH_HOME, 'state'),
} as const;

export const ensureHome = () => {
  mkdirSync(PATHS.postings, { recursive: true });
  mkdirSync(PATHS.state, { recursive: true });
};

export const readProfile = (): string => {
  try {
    return readFileSync(PATHS.profile, 'utf8');
  } catch {
    return '';
  }
};

export const writeProfile = (content: string): void => {
  writeFileSync(PATHS.profile, content);
};

export interface WatchlistEntry {
  name: string;
  provider: 'ashby' | 'greenhouse' | 'lever' | 'smartrecruiters';
  slug: string;
}

export const readWatchlist = (): WatchlistEntry[] => {
  try {
    return JSON.parse(readFileSync(PATHS.watchlist, 'utf8')).companies ?? [];
  } catch {
    return [];
  }
};

export const writeWatchlist = (entries: WatchlistEntry[]): void => {
  writeFileSync(PATHS.watchlist, JSON.stringify({ companies: entries }, null, 2));
};

export const loadEnv = (): void => {
  try {
    process.loadEnvFile(PATHS.env);
  } catch {
    // No .env in the config dir; TYPESAFE_API_KEY may be in the environment.
  }
};

export const statePath = (name: string): string => join(PATHS.state, name);

export const readJson = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (path: string, value: unknown): void => {
  mkdirSync(PATHS.state, { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};

export const hasApiKey = (): boolean =>
  Boolean(process.env.TYPESAFE_API_KEY && !process.env.TYPESAFE_API_KEY.includes('your-key'));
