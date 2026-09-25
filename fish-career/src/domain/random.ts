// Randomness as a dependency. Calibration draws must be reproducible: a seed
// recorded with the run lets the same slice be redrawn, so a disagreement can
// be re-examined instead of argued about.

export interface RandomSource {
  int(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
}

// mulberry32: small, fast, and stable across Node versions, which is what a
// recorded seed needs.
export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number =>
    maxExclusive <= 0 ? 0 : Math.floor(next() * maxExclusive);
  return {
    int,
    shuffle<T>(items: T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(i + 1);
        const a = out[i];
        const b = out[j];
        if (a !== undefined && b !== undefined) {
          out[i] = b;
          out[j] = a;
        }
      }
      return out;
    },
  };
};

export const systemRandom: RandomSource = {
  int: (maxExclusive: number) => Math.floor(Math.random() * maxExclusive),
  shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a !== undefined && b !== undefined) {
        out[i] = b;
        out[j] = a;
      }
    }
    return out;
  },
};
