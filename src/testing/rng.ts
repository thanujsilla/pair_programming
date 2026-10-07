/** Small seeded random generator (mulberry32), so benchmark sets are repeatable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
export const intBetween = (rng: () => number, lo: number, hi: number) => Math.floor(between(rng, lo, hi + 1));
/** roughly normal, mean 0, sd 1 */
export const gauss = (rng: () => number) => {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rng();
  return (s - 3) * Math.SQRT2;
};