#!/usr/bin/env node
// The skill layer has one canonical home, `.claude/skills/`, and one generated
// mirror, `.opencode/skill/`. Hosts disagree about where project skills live,
// and a hand-maintained copy drifts, so this script is the projection: one
// source, one mirror, and a check CI runs so drift fails the build.
//
//   node fish-career/scripts/sync-agent-layer.mjs          regenerate
//   node fish-career/scripts/sync-agent-layer.mjs --check  fail on drift

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

export const listSkills = (source) =>
  existsSync(source)
    ? readdirSync(source, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort()
    : [];

export const syncAgentLayer = ({ source, mirror, check = false }) => {
  const skills = listSkills(source);
  const drifted = [];
  const stale = [];

  for (const name of skills) {
    const from = join(source, name, 'SKILL.md');
    const to = join(mirror, name, 'SKILL.md');
    if (existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8')) continue;
    if (check) {
      drifted.push(name);
    } else {
      mkdirSync(join(mirror, name), { recursive: true });
      cpSync(from, to);
    }
  }

  if (existsSync(mirror)) {
    for (const entry of readdirSync(mirror, { withFileTypes: true })) {
      if (!entry.isDirectory() || skills.includes(entry.name)) continue;
      stale.push(entry.name);
      if (!check) rmSync(join(mirror, entry.name), { recursive: true, force: true });
    }
  }

  return { skills, drifted, stale };
};

const main = () => {
  const check = process.argv.includes('--check');
  const source = join(REPO_ROOT, '.claude', 'skills');
  const mirror = join(REPO_ROOT, '.opencode', 'skill');
  const { skills, drifted, stale } = syncAgentLayer({ source, mirror, check });

  if (check && (drifted.length > 0 || stale.length > 0)) {
    for (const name of drifted) console.error(`drift: ${name}`);
    for (const name of stale) console.error(`stale: ${name}`);
    console.error('skill mirrors are out of sync; run: npm --prefix fish-career run agents:sync');
    process.exit(1);
  }
  console.log(`skill layer ok: ${skills.length} skills ${check ? 'in sync' : 'synced'}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
