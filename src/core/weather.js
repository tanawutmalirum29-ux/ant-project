import { tileHash } from './random.js';

/** One weather phase lasts exactly 4,800 advancing simulation ticks. */
export const WEATHER_PHASE_TICKS = 4800;

/** Read-only growth-rate multipliers consumed by the ecology integration. */
export const WEATHER_FACTORS = Object.freeze({
  clear: Object.freeze({ carbs: 1, protein: 1, water: 1 }),
  rain: Object.freeze({ carbs: 1.25, protein: 1, water: 1.5 }),
  dry: Object.freeze({ carbs: 0.7, protein: 0.8, water: 0.6 })
});

const KINDS = Object.freeze(['clear', 'rain', 'dry']);
const WEATHER_SALT = 0x57454154;

/**
 * Deterministic weather-only state machine. Time is supplied by the caller:
 * tick() must be invoked once per actual fixed simulation step, after any pause
 * or speed accounting. No real-time API, RNG state or game-world mutation.
 */
export class Weather {
  constructor(world) {
    const seed = world?.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new TypeError('Weather requires an unsigned 32-bit world.seed');
    }

    this._seed = seed;
    this._phaseIndex = 0;
    this._kind = 'clear';
    this._remainingTicks = WEATHER_PHASE_TICKS;
  }

  get kind() { return this._kind; }
  get remainingTicks() { return this._remainingTicks; }
  get factors() { return WEATHER_FACTORS[this._kind]; }

  /**
   * Advance exactly one simulated tick. When a phase expires, immediately
   * begin the next full phase; at least one weather kind always changes.
   * The hash depends on the original world seed and numbered phase, not on
   * render timing, frame rate, invocation grouping or Math.random().
   */
  tick() {
    this._remainingTicks -= 1;
    if (this._remainingTicks === 0) {
      this._phaseIndex += 1;
      const otherKinds = KINDS.filter(kind => kind !== this._kind);
      const choice = tileHash(this._seed, this._phaseIndex, 0, WEATHER_SALT) < 0.5 ? 0 : 1;
      this._kind = otherKinds[choice];
      this._remainingTicks = WEATHER_PHASE_TICKS;
    }
  }
}
