#!/usr/bin/env node
// Enforces the engine's side of the framework boundary. README and
// ARCHITECTURE both claim the ranking engine has no framework dependency and
// that LangGraph lives only in examples/langgraph. The example proves the
// direction that matters: it imports the engine, the engine never imports it.
// Nothing enforced the other direction, so this check does.
//
// The rule is an allowlist rather than a list of banned frameworks. An engine
// file may import a node builtin, one of the package's declared dependencies
// or devDependencies, or a relative module that stays inside the package.
// Anything else fails, which means a new dependency becomes a deliberate
// change to the allowlist in package.json rather than an import that slips in.
//
// This also enforces spec 0003's I/O boundary, as amended on 2026-09-27.
// The rule is about the shipped runtime, so it scopes to non-test files; a
// non-test file is any file not ending in .test.ts. Test harnesses (excluded
// from the build by tsconfig.build.json and from the package by `files`) may
// import node:fs freely. The allowlist half above still covers every file,
// tests included.
//
//   - no non-test file under src/domain or src/application imports node:fs or
//     calls fetch;
//   - no non-test file under src/interfaces calls fetch;
//   - no non-test file under src/interfaces/mcp imports node:fs;
//   - under src/, fetch appears only in non-test files under src/adapters;
//   - src/interfaces/cli is the process edge, and a non-test file there may
//     import node:fs: reading a user-named file, reading bundled package data,
//     and the demo harness's temp home. Personal state still travels only
//     through ports.
//
// That is what keeps the application core runnable over in-memory adapters,
// and the MCP server, which runs in a host, honest about the same boundary.
// The CLI is the process edge.
//
// node:fs is detected through import specifiers, static and dynamic. fetch is
// a global, so it cannot be caught by its import specifier; the scan looks for
// call sites instead. Known limits of that scan: it does not parse, so the
// word `fetch(` inside a comment or a string is reported (a false positive),
// and an alias such as `const f = fetch; f()` is missed (a false negative).
//
// Run by CI and available as `npm run check:boundaries`.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');

// Matches `from 'x'`, bare `import 'x'`, and `import('x')` in one pass.
const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
// node:fs and its subpaths (node:fs/promises).
const NODE_FS = /^node:fs(?:\/|$)/;
// A fetch call site. Identifiers that merely contain the word (fetchPostings)
// do not match, but neither does an alias that never says `fetch(`.
const FETCH_CALL = /\bfetch\s*\(/;

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
};

const isInside = (child, parent) => child === parent || child.startsWith(parent + sep);

export const checkBoundaries = ({ packageRoot = PACKAGE_ROOT, sourceDir } = {}) => {
  const source = sourceDir ?? join(packageRoot, 'src');
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const declared = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].map((name) => ({ name, prefix: name + '/' }));

  const files = walk(source);
  const specifiers = new Set();
  const violations = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const where = relative(packageRoot, file);
    const zone = relative(source, file).split(sep).join('/');
    const inZone = (prefix) => zone === prefix || zone.startsWith(prefix + '/');
    const core = inZone('domain') || inZone('application');
    const surfaces = inZone('interfaces');
    const mcp = inZone('interfaces/mcp');
    const adapters = inZone('adapters');
    // The I/O rule scopes to shipped source; tests are not part of the runtime
    // boundary. The dependency allowlist still applies to every file.
    const isTest = file.endsWith('.test.ts');

    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[1];
      specifiers.add(spec);

      if (spec.startsWith('node:')) {
        if (!isTest && NODE_FS.test(spec)) {
          if (core) {
            violations.push(
              `${where} imports ${spec}, which src/domain and src/application forbid (spec 0003)`,
            );
          } else if (mcp) {
            violations.push(
              `${where} imports ${spec}, which src/interfaces/mcp forbids (spec 0003)`,
            );
          }
        }
        continue;
      }

      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (!isInside(target, packageRoot)) {
          violations.push(`${where} imports ${spec}, which escapes the package`);
        }
        continue;
      }

      const allowed = declared.some((d) => spec === d.name || spec.startsWith(d.prefix));
      if (!allowed) {
        violations.push(`${where} imports ${spec}, which the package does not declare`);
      }
    }

    if (!isTest && FETCH_CALL.test(text)) {
      if (core) {
        violations.push(
          `${where} calls fetch, which src/domain and src/application forbid (spec 0003)`,
        );
      } else if (surfaces) {
        violations.push(`${where} calls fetch, which src/interfaces forbids (spec 0003)`);
      } else if (!adapters) {
        violations.push(
          `${where} calls fetch, which under src/ is allowed only in src/adapters (spec 0003)`,
        );
      }
    }
  }

  return { files: files.length, specifiers: [...specifiers].sort(), violations };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, violations } = checkBoundaries();
  if (violations.length > 0) {
    console.error('boundary check failed:');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nIf an import is deliberate, declare it in fish-career/package.json. ' +
        'The engine is not supposed to grow a framework dependency, so expect ' +
        'that change to need a reason in the commit. The I/O rule is spec 0003: ' +
        'the core runs over in-memory adapters, the MCP server touches no ' +
        'filesystem, and the CLI is the process edge.',
    );
    process.exit(1);
  }
  console.log(
    `boundary ok: ${files} engine files import only declared dependencies and keep the spec 0003 boundary`,
  );
}
