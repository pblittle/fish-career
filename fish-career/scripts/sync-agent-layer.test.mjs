import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncAgentLayer } from './sync-agent-layer.mjs';

const roots = [];

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-agent-layer-'));
  roots.push(root);
  const source = join(root, '.claude', 'skills');
  const mirror = join(root, '.opencode', 'skill');
  mkdirSync(join(source, 'alpha'), { recursive: true });
  writeFileSync(join(source, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\nbody\n');
  return { source, mirror };
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('syncAgentLayer', () => {
  it('copies every canonical skill into the mirror', () => {
    const { source, mirror } = fixture();
    const { skills } = syncAgentLayer({ source, mirror });
    expect(skills).toEqual(['alpha']);
    expect(readFileSync(join(mirror, 'alpha', 'SKILL.md'), 'utf8')).toContain('name: alpha');
  });

  it('passes the check when the mirror matches', () => {
    const { source, mirror } = fixture();
    syncAgentLayer({ source, mirror });
    expect(syncAgentLayer({ source, mirror, check: true })).toMatchObject({
      drifted: [],
      stale: [],
    });
  });

  it('reports drift when the canonical file changes', () => {
    const { source, mirror } = fixture();
    syncAgentLayer({ source, mirror });
    writeFileSync(join(source, 'alpha', 'SKILL.md'), 'changed\n');
    expect(syncAgentLayer({ source, mirror, check: true }).drifted).toEqual(['alpha']);
  });

  it('reports a stale directory, and removes it on sync', () => {
    const { source, mirror } = fixture();
    mkdirSync(join(mirror, 'gone'), { recursive: true });
    writeFileSync(join(mirror, 'gone', 'SKILL.md'), 'orphan\n');
    expect(syncAgentLayer({ source, mirror, check: true }).stale).toEqual(['gone']);
    syncAgentLayer({ source, mirror });
    expect(existsSync(join(mirror, 'gone'))).toBe(false);
  });
});
