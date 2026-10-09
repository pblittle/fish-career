import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePaths, isUsableApiKey } from './home.js';

// A home can be a checkout of this repository. A file git tracks there is
// deleted from the home by any later commit that removes it from the repo:
// 390e48e removed watchlist.json and preferences.json, and a checkout used as
// the home lost its copies. Git must ignore every top-level path of the home.
const ignored = new Set(
  readFileSync(new URL('../../../../.gitignore', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\/$/, '')),
);

describe('the fish home and git', () => {
  it('ignores every top-level file and folder of the home', () => {
    const home = `${sep}home`;
    const top = new Set(
      Object.values(homePaths(home))
        .map((p) => relative(home, p).split(sep)[0])
        .filter((name): name is string => Boolean(name)),
    );
    expect(top.size).toBeGreaterThan(5);
    expect([...top].filter((name) => !ignored.has(`/${name}`) && !ignored.has(name))).toEqual([]);
  });
});

describe('isUsableApiKey', () => {
  it('accepts a real key', () => {
    expect(isUsableApiKey('ts_live_0123456789abcdef')).toBe(true);
  });

  it('rejects a missing or blank value', () => {
    expect(isUsableApiKey(undefined)).toBe(false);
    expect(isUsableApiKey('')).toBe(false);
    expect(isUsableApiKey('   ')).toBe(false);
  });

  it('rejects the .env.example placeholder', () => {
    expect(isUsableApiKey('your-key-from-https://console.typesafe.ai/keys')).toBe(false);
  });

  it('rejects an unresolved secret reference instead of sending it as a bearer token', () => {
    expect(isUsableApiKey('op://Vault/TypeSafe/credential')).toBe(false);
    expect(isUsableApiKey('vault://secret/typesafe')).toBe(false);
  });
});
