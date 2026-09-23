import { describe, expect, it } from 'vitest';
import { type Admission, admitPostings } from './fetch.js';
import type { Posting } from './providers.js';

const DAY = 86_400_000;
const now = Date.now();

const posting = (key: string, over: Partial<Posting> = {}): Posting => ({
  key,
  title: `Role ${key}`,
  location: 'Remote',
  workplace: 'Remote',
  remote: true,
  comp: '',
  url: `https://example.com/${key}`,
  date: new Date(now - DAY).toISOString(),
  text: 'x'.repeat(200),
  ...over,
});

describe('admitPostings', () => {
  it('writes a fresh in-window posting with usable text', () => {
    const [a] = admitPostings([posting('a')], {}, now - 14 * DAY) as Admission[];
    expect(a?.decision).toBe('write');
  });

  it('baselines an unseen posting older than the window: observed, not written', () => {
    const old = posting('a', { date: new Date(now - 30 * DAY).toISOString() });
    const [a] = admitPostings([old], {}, now - 14 * DAY);
    expect(a?.decision).toBe('baseline');
  });

  it('writes everything when there is no window', () => {
    const old = posting('a', { date: new Date(now - 300 * DAY).toISOString() });
    const [a] = admitPostings([old], {}, null);
    expect(a?.decision).toBe('write');
  });

  it('skips what seen.json already holds', () => {
    const [a] = admitPostings([posting('a')], { a: { title: 'seen' } }, null);
    expect(a?.decision).toBe('skip');
  });

  it('skips a duplicate within the same poll', () => {
    const out = admitPostings([posting('a'), posting('a')], {}, null);
    expect(out[0]?.decision).toBe('write');
    expect(out[1]?.decision).toBe('skip');
  });

  it('baselines an unparseable date rather than dropping or writing it blind', () => {
    // No window: undated postings are written (nothing to compare against).
    const [a] = admitPostings([posting('a', { date: '' })], {}, null);
    expect(a?.decision).toBe('write');
    // With a window: an undated posting cannot be placed, so it is kept.
    const [b] = admitPostings([posting('b', { date: '' })], {}, now - 14 * DAY);
    expect(b?.decision).toBe('write');
  });

  it('baselines a posting whose text is too short to score', () => {
    const thin = posting('a', { text: 'short' });
    const [a] = admitPostings([thin], {}, null);
    expect(a?.decision).toBe('needs-detail');
  });

  it('demands detail only when the provider might have it', () => {
    const thin = posting('a', { text: '' });
    const [a] = admitPostings([thin], {}, null);
    expect(a?.decision).toBe('needs-detail');
  });

  it('baselines a posting that stays thin after detail (caller reports back)', () => {
    const thin = posting('a', { text: 'short' });
    const [a] = admitPostings([thin], {}, null, { resolved: { a: 'still short' } });
    expect(a?.decision).toBe('baseline');
  });

  it('writes when resolved detail text is usable', () => {
    const thin = posting('a', { text: '' });
    const [a] = admitPostings([thin], {}, null, { resolved: { a: 'y'.repeat(200) } });
    expect(a?.decision).toBe('write');
    expect(a?.text).toBe('y'.repeat(200));
  });
});
