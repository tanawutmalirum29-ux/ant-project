import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { MilestoneTracker } from '../src/core/milestones.js';
import { UNDERGROUND } from '../src/world/generate.js';
import { isDiggable, isWalkable } from '../src/world/navigation.js';

const step = (game, count = 1) => {
  for (let i = 0; i < count; i++) assert.equal(game.update(100), 1);
};
const stage = (tracker, index) => tracker.getSnapshot().stages[index];

// Isolated observation fixtures exercise latch semantics without editing
// gameplay counters/rules or claiming fake inventory is a physical delivery.
function fixture() {
  const game = {
    foraging: { inventory: { carbs: 0, protein: 0, water: 0 } },
    colony: { completed: 0, workers: Array.from({ length: 5 }, (_, id) => ({ id })), queen: { alive: true } },
    rooms: { rooms: [] },
    combat: { defeated: 0 }
  };
  return { game, tracker: new MilestoneTracker(game) };
}
function unlockFirst(t) {
  const i = t.game.foraging.inventory;
  i.carbs = 1; t.tracker.observe();
  i.carbs = 0; i.protein = 1; t.tracker.observe();
  i.protein = 0; i.water = 1; t.game.colony.completed = 1; t.tracker.observe();
  assert.equal(t.tracker.getSnapshot().activeStage, 1);
}
function unlockSecond(t) {
  unlockFirst(t);
  t.game.rooms.rooms.push({ type: 'nursery', status: 'ready', connected: true });
  t.game.colony.workers.push({ id: 5 }, { id: 6 }, { id: 7 });
  t.tracker.observe();
  assert.equal(t.tracker.getSnapshot().activeStage, 2);
}

test('MILESTONE-CORE-01 initial snapshot exact frozen V1 shape; no read-side effects', () => {
  const g = new Game('milestone-initial');
  const s = g.milestones.getSnapshot();
  assert.equal(s.version, 1);
  assert.equal(s.tick, 0);
  assert.equal(s.activeStage, 0);
  assert.equal(s.allComplete, false);
  assert.deepEqual(s.stages.map(v => v.id), ['stock-and-dig', 'nursery-and-workers', 'defend-queen']);
  assert.deepEqual(s.stages.map(v => v.title),
    ['จัดหาเสบียงและขุดอุโมงค์', 'ขยายรังและแรงงาน', 'ปกป้องนางพญา']);
  assert.deepEqual(s.stages.map(v => v.complete), [false, false, false]);
  assert.deepEqual(s.stages.map(v => v.completedTick), [null, null, null]);
  assert.deepEqual(s.stages[0].progress,
    { carbsSeen: false, proteinSeen: false, waterSeen: false, digCompleted: false });
  assert.deepEqual(s.stages[1].progress,
    { nurseryReadyConnected: false, livingWorkers: 5, requiredWorkers: 8 });
  assert.deepEqual(s.stages[2].progress, { enemyDefeated: false, queenAlive: true });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.stages) &&
    s.stages.every(v => Object.isFrozen(v) && Object.isFrozen(v.progress)));
  const second = g.milestones.getSnapshot();
  assert.notStrictEqual(second, s);
  assert.notStrictEqual(second.stages, s.stages);
  assert.notStrictEqual(second.stages[0].progress, s.stages[0].progress);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.throws(() => { s.stages[0].progress.carbsSeen = true; }, TypeError);
  assert.equal(g.milestones.getSnapshot().tick, 0);
});

test('MILESTONE-CORE-11 tick-zero workers mirror the new colony and same-seed reset', () => {
  const seed = 'milestone-live-initial-workers';
  const original = new Game(seed);
  const initialCount = original.colony.workers.length;
  assert.equal(initialCount, 5);
  for (const snapshot of [original.milestones.getSnapshot(), original.milestones.getSnapshot()]) {
    assert.equal(snapshot.tick, 0);
    assert.equal(snapshot.stages[1].progress.livingWorkers, initialCount);
    assert.equal(snapshot.stages[1].progress.requiredWorkers, 8);
    assert.equal(snapshot.stages[1].complete, false);
    assert.equal(snapshot.stages[1].completedTick, null);
    assert.equal(snapshot.activeStage, 0);
    assert.equal(snapshot.allComplete, false);
  }
  assert.equal(original.clock.ticks, 0, 'reading progress never executes a tick');

  // A fixture-side loss is observed only on an executed simulation tick.
  original.colony.workers.pop();
  step(original);
  assert.equal(original.milestones.getSnapshot().stages[1].progress.livingWorkers,
    original.colony.workers.length);
  assert.equal(original.milestones.getSnapshot().tick, 1);

  const restarted = new Game(seed);
  const reset = restarted.milestones.getSnapshot();
  assert.equal(reset.tick, 0);
  assert.equal(restarted.clock.ticks, 0);
  assert.equal(reset.stages[1].progress.livingWorkers, restarted.colony.workers.length);
  assert.equal(reset.stages[1].progress.livingWorkers, initialCount);
  assert.ok(reset.stages.every(stage => !stage.complete && stage.completedTick === null));
  assert.equal(reset.activeStage, 0);
  assert.equal(reset.allComplete, false);
});

test('MILESTONE-CORE-02 stage1 latches separately delivered-stock observations after depletion and actual completed dig', () => {
  const t = fixture();
  // Cargo/sources and queued jobs do not count as delivered or excavated.
  t.game.colony.orders = [{ status: 'queued' }];
  t.game.foraging.nodes = [{ type: 'carbs', amount: 500 }];
  t.game.colony.workers[0].cargo = { type: 'protein', amount: 10 };
  t.tracker.observe();
  assert.deepEqual(stage(t.tracker, 0).progress,
    { carbsSeen: false, proteinSeen: false, waterSeen: false, digCompleted: false });
  t.game.foraging.inventory.carbs = 2;
  t.tracker.observe();
  t.game.foraging.inventory.carbs = 0;
  t.game.foraging.inventory.protein = 3;
  t.tracker.observe();
  t.game.foraging.inventory.protein = 0;
  t.game.foraging.inventory.water = 1;
  t.tracker.observe();
  t.game.foraging.inventory.water = 0;
  t.tracker.observe();
  assert.deepEqual(stage(t.tracker, 0).progress,
    { carbsSeen: true, proteinSeen: true, waterSeen: true, digCompleted: false });
  t.game.colony.completed = 1;
  t.tracker.observe();
  const done = stage(t.tracker, 0);
  assert.equal(done.complete, true);
  assert.equal(done.completedTick, 6);
  const frozen = done.progress;
  t.game.colony.completed = 0;
  t.tracker.observe();
  assert.deepEqual(stage(t.tracker, 0).progress, frozen);
  assert.equal(stage(t.tracker, 0).completedTick, 6);
});

test('MILESTONE-CORE-03 stage order guarantees maximum one completion per executed tick', () => {
  const t = fixture();
  Object.assign(t.game.foraging.inventory, { carbs: 1, protein: 1, water: 1 });
  t.game.colony.completed = 1;
  t.game.rooms.rooms.push({ type: 'nursery', status: 'ready', connected: true });
  t.game.colony.workers.push({ id: 5 }, { id: 6 }, { id: 7 });
  t.game.combat.defeated = 1;
  t.tracker.observe();
  assert.deepEqual(t.tracker.getSnapshot().stages.map(v => v.completedTick), [1, null, null]);
  t.tracker.observe();
  assert.deepEqual(t.tracker.getSnapshot().stages.map(v => v.completedTick), [1, 2, null]);
  t.tracker.observe();
  const all = t.tracker.getSnapshot();
  assert.deepEqual(all.stages.map(v => v.completedTick), [1, 2, 3]);
  assert.equal(all.activeStage, null);
  assert.equal(all.allComplete, true);
  t.game.colony.queen.alive = false;
  t.tracker.observe();
  assert.equal(t.tracker.getSnapshot().stages[2].progress.queenAlive, true);
  assert.deepEqual(t.tracker.getSnapshot().stages.map(v => v.completedTick), [1, 2, 3]);
});

test('MILESTONE-CORE-04 nursery connectivity and eight living workers must coincide', () => {
  const t = fixture();
  unlockFirst(t);
  const room = { type: 'nursery', status: 'planned', connected: true };
  t.game.rooms.rooms.push(room);
  t.game.colony.workers.push({ id: 5 }, { id: 6 }); // 7 living workers
  t.game.lifecycle = { brood: [{}, {}, {}] }; // Brood never contributes to threshold.
  t.tracker.observe();
  assert.equal(stage(t.tracker, 1).complete, false);
  room.status = 'ready';
  t.tracker.observe();
  assert.equal(stage(t.tracker, 1).progress.livingWorkers, 7);
  t.game.colony.workers.push({ id: 7 });
  room.connected = false;
  t.tracker.observe();
  assert.equal(stage(t.tracker, 1).progress.nurseryReadyConnected, false);
  assert.equal(stage(t.tracker, 1).complete, false);
  room.connected = true;
  t.tracker.observe();
  assert.equal(stage(t.tracker, 1).complete, true);
  assert.equal(stage(t.tracker, 1).completedTick, 7);
  t.game.colony.workers.length = 3;
  room.status = 'disabled';
  t.tracker.observe();
  assert.deepEqual(stage(t.tracker, 1).progress,
    { nurseryReadyConnected: true, livingWorkers: 8, requiredWorkers: 8 });
});

test('MILESTONE-CORE-05 combat requires actual defeated counter and living queen in SAME tick', () => {
  const t = fixture();
  unlockSecond(t);
  t.game.combat.defeated = 1;
  t.game.colony.queen.alive = false;
  t.tracker.observe();
  assert.equal(stage(t.tracker, 2).complete, false);
  assert.deepEqual(stage(t.tracker, 2).progress, { enemyDefeated: true, queenAlive: false });
  t.game.combat.defeated = 0;
  t.game.colony.queen.alive = true;
  t.tracker.observe();
  assert.equal(stage(t.tracker, 2).complete, false);
  t.game.combat.defeated = 1;
  t.tracker.observe();
  assert.equal(stage(t.tracker, 2).complete, true);
  assert.equal(t.tracker.getSnapshot().allComplete, true);
});

test('MILESTONE-CORE-06 last-system registration, completed tick numbering, pause and no frame-based progress', () => {
  const game = new Game('milestone-tick');
  assert.match(game.systems.at(-1).toString(), /milestones\.observe/);
  let extra = 0;
  game.onTick(() => extra++);
  assert.match(game.systems.at(-1).toString(), /milestones\.observe/);
  game.setSpeed(0);
  for (let i = 0; i < 40; i++) assert.equal(game.update(100), 0);
  assert.equal(game.milestones.getSnapshot().tick, 0);
  game.setSpeed(1);
  assert.equal(game.update(50), 0);
  assert.equal(game.milestones.getSnapshot().tick, 0);
  assert.equal(game.update(50), 1);
  assert.equal(game.milestones.getSnapshot().tick, 1);
  assert.equal(game.clock.ticks, 1);
  assert.equal(extra, 1);
  step(game, 7);
  assert.equal(game.milestones.getSnapshot().tick, game.clock.ticks);
  assert.equal(game.milestones.getSnapshot().tick, 8);
  game.setSpeed(0);
  game.update(250);
  assert.equal(game.clock.ticks, 8);
});

test('MILESTONE-CORE-07 equal executed ticks at x1/x2/x4 yield identical live snapshots', () => {
  const cases = [1, 2, 4].map(speed => {
    const game = new Game('milestone-speed-determinism');
    game.setSpeed(speed);
    for (let tick = 0; tick < 60 / speed; tick++) assert.equal(game.update(100), speed);
    assert.equal(game.clock.ticks, 60);
    return game.milestones.getSnapshot();
  });
  for (const state of cases.slice(1)) assert.deepEqual(state, cases[0]);
});

test('MILESTONE-CORE-08 fresh same-seed Game resets all milestones and reproduces early observations', () => {
  const first = new Game('milestone-seed-reset');
  step(first, 25);
  const snapshot = first.milestones.getSnapshot();
  const fresh = new Game('milestone-seed-reset');
  assert.equal(fresh.milestones.getSnapshot().tick, 0);
  assert.equal(fresh.milestones.getSnapshot().activeStage, 0);
  assert.equal(fresh.milestones.getSnapshot().allComplete, false);
  step(fresh, 25);
  assert.deepEqual(fresh.milestones.getSnapshot(), snapshot);
  assert.notStrictEqual(first.milestones, fresh.milestones);
});

test('MILESTONE-CORE-09 live gathering and completed excavation contribute real observations', () => {
  const game = new Game('milestone-physical-delivery');
  const seen = { carbs: false, protein: false, water: false };
  let delivery = false;
  for (let tick = 0; tick < 1600; tick++) {
    step(game);
    if (game.foraging.completedTrips > 0) delivery = true;
    for (const kind of Object.keys(seen))
      if (game.foraging.inventory[kind] > 0) seen[kind] = true;
    if (delivery && Object.values(seen).some(Boolean)) break;
  }
  assert.equal(delivery, true, 'should observe physical foraging deliveries');
  for (const type of Object.keys(seen)) {
    if (seen[type]) assert.equal(stage(game.milestones, 0).progress[`${type}Seen`], true);
  }

  const dig = new Game('milestone-real-excavation');
  dig.colony.setForageSlots(0);
  const underground = dig.world.layers[UNDERGROUND];
  let frontier = null;
  for (let y = 2; y < underground.height - 2 && !frontier; y++) {
    for (let x = 2; x < underground.width - 2 && !frontier; x++) {
      if (isDiggable(underground, x, y) &&
        [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => isWalkable(underground, x + dx, y + dy))) {
        frontier = { x, y };
      }
    }
  }
  assert.ok(frontier);
  assert.equal(dig.colony.queueRectangle(frontier, frontier).added, 1);
  step(dig, 1);
  assert.equal(stage(dig.milestones, 0).progress.digCompleted, false);
  for (let i = 0; i < 450 && dig.colony.completed === 0; i++) step(dig);
  assert.ok(dig.colony.completed >= 1, 'a worker must physically finish digging');
  assert.equal(stage(dig.milestones, 0).progress.digCompleted, true);
});

test('MILESTONE-CORE-10 real battlefield kill is observed, without spawning rewards', () => {
  const game = new Game('combat');
  game.colony.setForageSlots(0);
  game.lifecycle.setNurseSlots(0);
  game.combat.setSoldierSlots(2);
  const enemy = game.combat.spawn('beetle', UNDERGROUND, game.colony.queen.x, game.colony.queen.y - 4);
  assert.ok(enemy, 'test arranges an actual enemy through the preexisting combat API');
  for (let i = 0; i < 300 && game.combat.defeated === 0; i++) step(game);
  assert.ok(game.combat.defeated >= 1, 'defender must eliminate a real enemy');
  assert.equal(stage(game.milestones, 2).progress.enemyDefeated, true);
});
