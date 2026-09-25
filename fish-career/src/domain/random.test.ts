import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './random.js';

describe('createSeededRandom', () => {
  it('draws the same sequence for the same seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    expect([a.int(1000), a.int(1000), a.int(1000)]).toEqual([
      b.int(1000),
      b.int(1000),
      b.int(1000),
    ]);
  });

  it('draws a different sequence for a different seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(43);
    expect([a.int(1000), a.int(1000)]).not.toEqual([b.int(1000), b.int(1000)]);
  });

  it('shuffles reproducibly and preserves every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const one = createSeededRandom(7).shuffle(items);
    const two = createSeededRandom(7).shuffle(items);
    expect(one).toEqual(two);
    expect([...one].sort((a, b) => a - b)).toEqual(items);
  });

  it('never returns an index outside the range', () => {
    const random = createSeededRandom(1);
    for (let i = 0; i < 200; i += 1) {
      const n = random.int(3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(3);
    }
  });
});
