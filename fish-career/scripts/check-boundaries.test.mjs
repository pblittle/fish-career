import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBoundaries } from './check-boundaries.mjs';

const roots = [];

const fixture = ({ source = '', deps = {}, devDeps = {} }) => {
  const root = mkdtempSync(join(tmpdir(), 'fish-boundary-'));
  roots.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: deps, devDependencies: devDeps }),
  );
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'index.ts'), source);
  return root;
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('checkBoundaries', () => {
  it('passes when every import is a builtin, a declared dependency, or relative', () => {
    const root = fixture({
      deps: { zod: '^4.0.0' },
      source: [
        "import { readFileSync } from 'node:fs';",
        "import { z } from 'zod';",
        "import { helper } from './helper.js';",
        '',
      ].join('\n'),
    });
    writeFileSync(join(root, 'src', 'helper.ts'), 'export const helper = 1;\n');
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('rejects a framework the package does not declare', () => {
    const root = fixture({ source: "import { StateGraph } from '@langchain/langgraph';\n" });
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('@langchain/langgraph');
  });

  it('accepts a subpath of a declared dependency', () => {
    const root = fixture({
      deps: { '@modelcontextprotocol/server': '^2.0.0' },
      source: "import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';\n",
    });
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('accepts a devDependency, which is how the test files import vitest', () => {
    const root = fixture({
      devDeps: { vitest: '^5.0.0' },
      source: "import { it } from 'vitest';\n",
    });
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('rejects a relative import that escapes the package', () => {
    const root = fixture({
      source: "import { graph } from '../../../examples/langgraph/src/app.js';\n",
    });
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('escapes the package');
  });

  it('reports every offending file, not just the first', () => {
    const root = fixture({ source: "import 'a-framework';\n" });
    writeFileSync(join(root, 'src', 'other.ts'), "import 'another-framework';\n");
    expect(checkBoundaries({ packageRoot: root }).violations).toHaveLength(2);
  });
});
