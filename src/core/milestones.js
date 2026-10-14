/**
 * Session-local, observation-only colony milestones.
 * Public shape is frozen by governance contract M000034.
 * This tracker never edits the colony, inventory, combat, rooms, or world.
 */
const STAGE_INFO = Object.freeze([
  Object.freeze({ id: 'stock-and-dig', title: 'จัดหาเสบียงและขุดอุโมงค์' }),
  Object.freeze({ id: 'nursery-and-workers', title: 'ขยายรังและแรงงาน' }),
  Object.freeze({ id: 'defend-queen', title: 'ปกป้องนางพญา' })
]);

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, frozenCopy(child)])
    ));
  }
  return value;
}

export class MilestoneTracker {
  constructor(game) {
    this.game = game;
    this.tick = 0;
    this.stockSeen = { carbs: false, protein: false, water: false };
    this.stages = [
      { ...STAGE_INFO[0], complete: false, completedTick: null,
        progress: { carbsSeen: false, proteinSeen: false, waterSeen: false, digCompleted: false } },
      { ...STAGE_INFO[1], complete: false, completedTick: null,
        progress: { nurseryReadyConnected: false, livingWorkers: game.colony.workers.length, requiredWorkers: 8 } },
      { ...STAGE_INFO[2], complete: false, completedTick: null,
        progress: { enemyDefeated: false, queenAlive: true } }
    ];
  }

  /**
   * Called once as the FINAL Game.systems callback of an executed fixed-step.
   * FixedStepper advances game.clock.ticks only after that callback returns,
   * so this independent count is the committed, 1-based observation tick.
   */
  observe() {
    this.tick++;
    const game = this.game;
    const inventory = game.foraging.inventory;
    for (const type of ['carbs', 'protein', 'water']) {
      if (inventory[type] > 0) this.stockSeen[type] = true;
    }

    const progress = [
      {
        carbsSeen: this.stockSeen.carbs,
        proteinSeen: this.stockSeen.protein,
        waterSeen: this.stockSeen.water,
        digCompleted: game.colony.completed >= 1
      },
      {
        nurseryReadyConnected: game.rooms.rooms.some(room =>
          room.type === 'nursery' && room.status === 'ready' && room.connected === true),
        livingWorkers: game.colony.workers.length,
        requiredWorkers: 8
      },
      {
        enemyDefeated: game.combat.defeated >= 1,
        queenAlive: game.colony.queen.alive === true
      }
    ];

    // Incomplete stages display current observations. Completed stages retain
    // the exact progress captured on their completion tick, even after losses.
    for (let i = 0; i < this.stages.length; i++) {
      if (!this.stages[i].complete) this.stages[i].progress = progress[i];
    }

    const active = this.stages.findIndex(stage => !stage.complete);
    if (active === -1) return;

    const p = this.stages[active].progress;
    const passed = active === 0
      ? p.carbsSeen && p.proteinSeen && p.waterSeen && p.digCompleted
      : active === 1
        ? p.nurseryReadyConnected && p.livingWorkers >= p.requiredWorkers
        : p.enemyDefeated && p.queenAlive;

    // Exactly one ordered stage can latch, even if all conditions are true.
    if (passed) {
      this.stages[active].complete = true;
      this.stages[active].completedTick = this.tick;
    }
  }

  /**
   * A fresh, recursively frozen JSON-safe view each time. No references to
   * mutable Game data, and no observations occur during a read.
   */
  getSnapshot() {
    const active = this.stages.findIndex(stage => !stage.complete);
    return frozenCopy({
      version: 1,
      tick: this.tick,
      stages: this.stages.map(stage => ({
        id: stage.id,
        title: stage.title,
        complete: stage.complete,
        completedTick: stage.completedTick,
        progress: stage.progress
      })),
      activeStage: active === -1 ? null : active,
      allComplete: active === -1
    });
  }
}
