import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homePaths } from './home.js';

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
