/** Small deterministic, dependency-free 32-bit random generator. */
export function normalizeSeed(value) {
  const text = String(value ?? 'ant-kingdom').trim() || 'ant-kingdom';
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function createRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; },
    get state() { return state; }
  };
}
/** Stateless seeded tile decoration; independent from render order. */
export function tileHash(seed, x, y, salt = 0) {
  let h = (seed ^ Math.imul(x + 101, 374761393) ^ Math.imul(y + 53, 668265263) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
