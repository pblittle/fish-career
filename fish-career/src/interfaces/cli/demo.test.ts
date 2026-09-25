import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runDemo } from './demo.js';

describe('runDemo', () => {
  it('runs fetch, triage, evaluate, and calibrate with no network', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('the demo must not touch the network');
    });
    const lines: string[] = [];
    const result = await runDemo({ out: (line) => lines.push(line) });
    vi.unstubAllGlobals();

    expect(result.arrivals).toBe(6);
    expect(result.evaluation).toMatchObject({ satisfied: 4, total: 4, violations: [] });
    // The recorded human order ranks the Atlanta engineer above the Austin
    // variant of the architect role; the judge prefers the variant. That
    // disagreement is the demo's point, and it is deterministic.
    expect(result.rho).toBe(0.5);

    const text = lines.join('\n');
    expect(text).toContain('fish.career demo');
    expect(text).toContain('LangChain: Deployed Architect');
    expect(text).toContain('also posted at Dallas, Austin');
    expect(text).toContain('non-remote skipped, as the real pipeline does');
    expect(text).toContain('operator-revealed preferences: 4/4 satisfied');
    expect(text).toContain('Spearman rho: 0.50');
    expect(existsSync(result.home)).toBe(false);
  });

  it('keeps the temp home when asked', async () => {
    const lines: string[] = [];
    const result = await runDemo({ out: (line) => lines.push(line), keep: true });
    expect(existsSync(result.home)).toBe(true);
  });
});
