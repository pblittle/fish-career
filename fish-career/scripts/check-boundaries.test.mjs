import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

const addFile = (root, rel, source) => {
  const full = join(root, 'src', rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, source);
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

describe('the spec 0003 I/O boundary', () => {
  it('rejects node:fs under src/domain and src/application', () => {
    const root = fixture({});
    addFile(root, 'domain/posting.ts', "import { readFileSync } from 'node:fs';\n");
    addFile(
      root,
      'application/fetch-postings.ts',
      "import { readFileSync } from 'node:fs/promises';\n",
    );
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(
      violations.some(
        (v) =>
          v.includes('src/domain/posting.ts') &&
          v.includes('node:fs') &&
          v.includes('src/domain and src/application'),
      ),
    ).toBe(true);
    expect(
      violations.some(
        (v) => v.includes('src/application/fetch-postings.ts') && v.includes('node:fs/promises'),
      ),
    ).toBe(true);
  });

  it('rejects a fetch call under src/domain and src/application', () => {
    const root = fixture({});
    addFile(root, 'domain/quality.ts', 'const res = await fetch(url);\n');
    addFile(root, 'application/fetch-postings.ts', 'return fetch(url);\n');
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(
      violations.some((v) => v.includes('src/domain/quality.ts') && v.includes('calls fetch')),
    ).toBe(true);
  });

  it('does not flag an identifier that merely contains the word fetch', () => {
    const root = fixture({});
    addFile(
      root,
      'application/fetch-postings.ts',
      'export const fetchPostings = () => 1;\napp.fetchPostings();\n',
    );
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('rejects node:fs under src/interfaces/mcp', () => {
    const root = fixture({});
    addFile(root, 'interfaces/mcp/tools.ts', "import { readFileSync } from 'node:fs';\n");
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('src/interfaces/mcp/tools.ts');
    expect(violations[0]).toContain('src/interfaces/mcp');
  });

  it('rejects a fetch call under src/interfaces', () => {
    const root = fixture({});
    addFile(root, 'interfaces/mcp/tools.ts', 'const res = await fetch(url);\n');
    addFile(root, 'interfaces/cli/cli.ts', 'await fetch(url);\n');
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.includes('calls fetch') && v.includes('src/interfaces'))).toBe(
      true,
    );
  });

  it('rejects every banned builtin under the core and src/interfaces/mcp', () => {
    const builtins = ['child_process', 'net', 'http', 'https', 'dns', 'worker_threads', 'module'];
    const root = fixture({});
    builtins.forEach((name, i) => {
      addFile(root, `domain/io-${i}.ts`, `import 'node:${name}';\n`);
      addFile(root, `interfaces/mcp/io-${i}.ts`, `import 'node:${name}';\n`);
    });
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(builtins.length * 2);
    for (const name of builtins) {
      expect(violations.some((v) => v.includes(`node:${name}`))).toBe(true);
    }
  });

  it('rejects a dynamic import of a banned builtin under the core and src/interfaces/mcp', () => {
    const root = fixture({});
    addFile(root, 'domain/lazy.ts', "const { readFileSync } = await import('node:fs');\n");
    addFile(root, 'interfaces/mcp/lazy.ts', "const { connect } = await import('node:net');\n");
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(violations.some((v) => v.includes('node:fs'))).toBe(true);
    expect(violations.some((v) => v.includes('node:net'))).toBe(true);
  });

  it('covers .mts and .cts sources, and treats their test files as tests', () => {
    const root = fixture({});
    addFile(root, 'domain/io.mts', "import { readFileSync } from 'node:fs';\n");
    addFile(root, 'application/io.cts', "import { connect } from 'node:net';\n");
    addFile(root, 'domain/preferences.test.mts', "import { readFileSync } from 'node:fs';\n");
    addFile(root, 'application/fetch-postings.test.cts', "import { connect } from 'node:net';\n");
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(violations.some((v) => v.includes('io.mts'))).toBe(true);
    expect(violations.some((v) => v.includes('io.cts'))).toBe(true);
  });

  it('allows node:fs under src/interfaces/cli, static or dynamic', () => {
    const root = fixture({});
    addFile(root, 'interfaces/cli/quality.ts', "import { readFileSync } from 'node:fs';\n");
    addFile(root, 'interfaces/cli/cli.ts', "const { readFileSync } = await import('node:fs');\n");
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('rejects fetch outside src/adapters, even in ports or bootstrap', () => {
    const root = fixture({});
    addFile(root, 'ports/ats-provider.ts', 'return fetch(url);\n');
    addFile(root, 'bootstrap/version.ts', 'return fetch(url);\n');
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.includes('src/adapters') && v.includes('allowed only'))).toBe(
      true,
    );
  });

  it('allows fetch under src/adapters', () => {
    const root = fixture({});
    addFile(root, 'adapters/ats/providers.ts', 'const res = await fetch(url);\n');
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('allows node:fs in a test file under src/domain, src/application, or src/interfaces/mcp', () => {
    const root = fixture({});
    addFile(root, 'domain/preferences.test.ts', "import { readFileSync } from 'node:fs';\n");
    addFile(
      root,
      'application/fetch-postings.test.ts',
      "import { readFileSync } from 'node:fs';\n",
    );
    addFile(root, 'interfaces/mcp/server.test.ts', "import { readFileSync } from 'node:fs';\n");
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('allows a fetch call in a test file under src/interfaces', () => {
    const root = fixture({});
    addFile(root, 'interfaces/mcp/server.test.ts', 'await fetch(url);\n');
    addFile(root, 'interfaces/mcp/server.test.mts', 'await fetch(url);\n');
    expect(checkBoundaries({ packageRoot: root }).violations).toEqual([]);
  });

  it('still checks the dependency allowlist in test files', () => {
    const root = fixture({});
    addFile(
      root,
      'domain/preferences.test.ts',
      "import { StateGraph } from '@langchain/langgraph';\n",
    );
    const { violations } = checkBoundaries({ packageRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('@langchain/langgraph');
  });

  it('passes on the real tree, which is the tree the rule must fit', () => {
    expect(checkBoundaries().violations).toEqual([]);
  });
});
