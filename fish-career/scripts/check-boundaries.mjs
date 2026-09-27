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
// Run by CI and available as `npm run check:boundaries`.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');

// Matches `from 'x'`, bare `import 'x'`, and `import('x')` in one pass.
const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

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
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[1];
      specifiers.add(spec);

      if (spec.startsWith('node:')) continue;

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
  }

  return { files: files.length, specifiers: [...specifiers].sort(), violations };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, violations } = checkBoundaries();
  if (violations.length > 0) {
    console.error('boundary check failed:');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nIf the import is deliberate, declare it in fish-career/package.json. ' +
        'The engine is not supposed to grow a framework dependency, so expect ' +
        'that change to need a reason in the commit.',
    );
    process.exit(1);
  }
  console.log(`boundary ok: ${files} engine files import only declared dependencies`);
}
