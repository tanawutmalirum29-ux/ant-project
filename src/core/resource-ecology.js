import { RESOURCE_TYPES } from '../world/resources.js';

/**
 * One renewed unit per eligible source every N advancing simulation ticks.
 * Water replenishes fastest, carbohydrate plants next; insects/protein slowest.
 * 10 game ticks/s at x1 => 30s / 42s / 90s per source unit.
 *
 * Site-local integer accumulators prevent floating-point drift after many ticks;
 * regrowthProgress is only their public 0 <= fraction < 1 projection.
 */
export const RESOURCE_REGROWTH_TICKS = Object.freeze({
  carbs: 420,
  protein: 900,
  water: 300
});

const types = new Set(RESOURCE_TYPES);

/** Finite capacity, physical sources and an explicit journal of new natural inflow. */
export class ResourceEcology {
  constructor(world) {
    if (!world || !Array.isArray(world.resources)) {
      throw new TypeError('ResourceEcology requires a world.resources array');
    }
    this.world = world;
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
    const elapsed = node.amount === cap
      ? 0 : Math.min(rate - 1, Math.round(progress * rate));
    node.maxAmount = cap;
    node.regrowthProgress = elapsed / rate;
    this._elapsed.set(node, elapsed);
  }

  /** Advance exactly ONE fixed game tick; the Game fixed stepper controls pause/speed. */
  tick() {
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
      // Foraging owns reservations. This engine touches only amount/progress.
      const rate = RESOURCE_REGROWTH_TICKS[node.type];
      const elapsed = this._elapsed.get(node) + 1;
      if (elapsed >= rate) {
        node.amount += 1;                         // exactly one physical source unit
        this.regenerated[node.type] += 1;          // explicit external inflow ledger
        this._elapsed.set(node, 0);
        node.regrowthProgress = 0;
      } else {
        this._elapsed.set(node, elapsed);
        node.regrowthProgress = elapsed / rate;
      }
    }
    return this.regenerated;
  }
}
