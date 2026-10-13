import { RESOURCE_TYPES } from '../world/resources.js';

/**
 * One renewed unit per eligible source every N advancing simulation ticks.
 * Water replenishes fastest, carbohydrate plants next; insects/protein slowest.
 * 10 game ticks/s at x1 => 30s / 42s / 90s per source unit.
 *
 * Site-local integer accumulators prevent floating-point drift after many ticks.
 * Without weather, keep the original one-integer-per-game-tick accounting.
 * With weather, fractional multipliers are quantized ONCE per advancing tick
 * to precise fixed-point units; fractional growth is not rounded per tick.
 */
export const RESOURCE_REGROWTH_TICKS = Object.freeze({
  carbs: 420,
  protein: 900,
  water: 300
});

const types = new Set(RESOURCE_TYPES);
// 10^12 resolves the agreed rain/drought decimals exactly, without cumulative
// binary floating-point drift at their unit-regeneration boundaries.
// Even the slowest base period (900 ticks) fits safely in a JS integer.
const WEATHER_SCALE = 1_000_000_000_000;

/** Finite capacity, physical sources and an explicit journal of new natural inflow. */
export class ResourceEcology {
  constructor(world, weather = null) {
    if (!world || !Array.isArray(world.resources)) {
      throw new TypeError('ResourceEcology requires a world.resources array');
    }
    this.world = world;
    this.weather = weather;
    this.regenerated = { carbs: 0, protein: 0, water: 0 };
    this._elapsed = new WeakMap();
    for (const node of world.resources) this._initialize(node);
  }

  _initialize(node) {
    if (!node || !types.has(node.type)) throw new TypeError('Invalid resource type');
    // Migration for existing node fixtures; no capacity is invented from amount.
    const cap = node.maxAmount ?? node.initialAmount;
    if (!Number.isSafeInteger(cap) || cap <= 0) {
      throw new RangeError('Resource site must have positive initial capacity');
    }
    if (!Number.isSafeInteger(node.amount) || node.amount < 0 || node.amount > cap) {
      throw new RangeError('Resource amount must be an integer within site capacity');
    }
    if (!Number.isSafeInteger(node.reserved) || node.reserved < 0 || node.reserved > node.amount) {
      throw new RangeError('Resource reservation must be within physical amount');
    }
    const progress = node.regrowthProgress ?? 0;
    if (!Number.isFinite(progress) || progress < 0 || progress >= 1) {
      throw new RangeError('Resource regrowthProgress must be in [0,1)');
    }
    const rate = RESOURCE_REGROWTH_TICKS[node.type];
    const period = rate * (this.weather ? WEATHER_SCALE : 1);
    const elapsed = node.amount === cap
      ? 0 : Math.min(period - 1, Math.round(progress * period));
    node.maxAmount = cap;
    node.regrowthProgress = elapsed / period;
    this._elapsed.set(node, elapsed);
  }

  /**
   * Read factors once per tick, before changing ANY node. The Weather engine is
   * owned by Game: this class NEVER advances weather or wall-clock time.
   * Values beyond fixed-point representability must fail closed rather than
   * injecting impossible stock or silently freezing a positive growth rate.
   */
  _weatherDeltas() {
    if (!this.weather) return null;
    const factors = this.weather.factors;
    const deltas = {};
    for (const type of RESOURCE_TYPES) {
      const factor = factors?.[type];
      const scaled = Math.round(factor * WEATHER_SCALE);
      if (!Number.isFinite(factor) || factor <= 0 ||
          !Number.isSafeInteger(scaled) || scaled <= 0) {
        throw new RangeError('Invalid weather regeneration factor: ' + type);
      }
      deltas[type] = scaled;
    }
    return deltas;
  }

  /** Advance exactly ONE fixed game tick; Game owns pause, speed and weather ordering. */
  tick() {
    const deltas = this._weatherDeltas();
    // Iterate the authoritative world array, never a copied or respawned node list.
    for (const node of this.world.resources) {
      if (!this._elapsed.has(node)) this._initialize(node);
      const cap = node.maxAmount;
      if (node.amount === cap) {
        // A full site must never bank an instant free unit for the next harvest.
        if (this._elapsed.get(node) !== 0 || node.regrowthProgress !== 0) {
          this._elapsed.set(node, 0);
          node.regrowthProgress = 0;
        }
        continue;
      }
      // Foraging owns reservations and transport; ecology only adds actual units.
      const rate = RESOURCE_REGROWTH_TICKS[node.type];
      const period = rate * (deltas ? WEATHER_SCALE : 1);
      const elapsed = this._elapsed.get(node) + (deltas ? deltas[node.type] : 1);
      if (elapsed >= period) {
        // Large valid factors can renew multiple units in one tick; never exceed
        // the available site capacity or lose an unspent fractional remainder.
        const created = Math.min(cap - node.amount, Math.floor(elapsed / period));
        node.amount += created;
        this.regenerated[node.type] += created;   // explicit natural external inflow
        const remainder = node.amount === cap ? 0 : elapsed - created * period;
        this._elapsed.set(node, remainder);
        node.regrowthProgress = remainder / period;
      } else {
        this._elapsed.set(node, elapsed);
        node.regrowthProgress = elapsed / period;
      }
    }
    return this.regenerated;
  }
}
