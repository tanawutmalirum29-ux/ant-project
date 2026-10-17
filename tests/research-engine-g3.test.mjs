import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { TICK_MS } from '../src/core/time.js';
import { LIFE } from '../src/core/lifecycle.js';
import { UNDERGROUND, SURFACE } from '../src/world/generate.js';
import { RESEARCH_CATALOG } from '../src/core/research.js';

const TYPES = ['carbs', 'protein', 'water'];
const ZERO = Object.freeze({ carbs: 0, protein: 0, water: 0 });
const STEP = (g, n = 1) => { for (let i = 0; i < n; i++) assert.equal(g.update(TICK_MS), 1); };
const physical = (g, type) => g.rooms.rooms.reduce((n, room) => n + (room.stock?.[type] || 0), 0);
const mass = (g) => Object.fromEntries(TYPES.map(type => [type,
  // A live multi-tick Game legitimately FEEDS adults between Research's
  // start and completion. Consumption is neither leaked nor newly minted mass.
  // Count all authoritative sinks/escrows, not only remaining depot stock.
  physical(g, type) + g.research.held[type] + g.research.spent[type] +
  g.lifecycle.consumed[type] + g.lifecycle.lost[type] +
  g.lifecycle.heldEgg[type] + g.lifecycle.eggSpent[type] +
  g.rooms.held[type] + g.rooms.spent[type]]));
const invariant = (g) => {
  for (const type of TYPES) {
    assert.equal(physical(g, type), g.foraging.inventory[type], 'physical aggregate ' + type);
    for (const room of g.rooms.rooms) {
      const reserved = g.rooms.refundableForSource(room.id, type);
      assert.ok((room.stock?.[type] || 0) + reserved <= g.rooms.effectiveRoomCap(room, type),
        'original-source refund escrow cannot overflow ' + room.id + '/' + type);
    }
  }
};
function fund(g, room, values) {
  // BOUNDARY FIXTURE: disclosed injected/withdrawn REAL physical depot stock,
  // mirrored in the aggregate. Not a natural harvest, not a free UI credit.
  for (const type of TYPES) {
    const next = values[type] ?? 0;
    assert.ok(Number.isSafeInteger(next) && next >= 0 &&
      next <= g.rooms.effectiveRoomCap(room, type), 'real depot cap for ' + type);
    const delta = next - (room.stock[type] || 0);
    room.stock[type] = next;
    g.foraging.inventory[type] += delta;
  }
  invariant(g);
}
function game(seed) {
  const g = new Game(seed);
  g.pauseOnDefeat = true;
  g.colony.setForageSlots(0);
  g.lifecycle.setNurseSlots(0);
  return g;
}
function payAndFinish(g, id) {
  fund(g, g.rooms.rooms[0], { carbs: 24, protein: 24, water: 24 });
  const result = g.research.start(id);
  assert.equal(result.ok, true, id + ': physically funded');
  const duration = RESEARCH_CATALOG.find(t => t.id === id).totalTicks;
  STEP(g, duration);
  assert.equal(g.research.hasCompleted(id), true, id + ': actual Game completion');
  invariant(g);
  return result.runId;
}
function completePrerequisites(g, id, visited = new Set()) {
  const entry = RESEARCH_CATALOG.find(t => t.id === id);
  for (const pre of entry.prerequisiteIds) {
    if (visited.has(pre)) continue;
    completePrerequisites(g, pre, visited);
    payAndFinish(g, pre);
    visited.add(pre);
  }
}
function started(g) {
  fund(g, g.rooms.rooms[0], { carbs: 24, protein: 24, water: 24 });
  const start = g.research.start('foraging_routes');
  assert.equal(start.ok, true);
  assert.equal(g.research.snapshot().active.progressTicks, 0);
  STEP(g, 599);
  assert.equal(g.research.snapshot().active.progressTicks, 599);
  assert.equal(g.research.hasCompleted('foraging_routes'), false);
  return start.runId;
}
for (const paused of [true, false]) {
  for (const cause of ['starvation', 'dehydration', 'combat']) {
    test('CP-A-G3 lethal real ' + cause + ' in last tick, pauseOnDefeat=' + paused, () => {
      const g = game('CP-A-G3-FATAL-' + cause + '-' + paused);
      g.pauseOnDefeat = paused;
      const runId = started(g);
      const before = g.research.snapshot();
      const beforeHeld = { ...g.research.held };
      assert.equal(before.active.progressTicks, 599);
      assert.deepEqual(beforeHeld, { carbs: 6, protein: 4, water: 3 });
      let observerCalls = 0;
      g.onTick(() => observerCalls++);
      if (cause === 'starvation' || cause === 'dehydration') {
        // Boundary fixture: force the next REAL Lifecycle.tickAdults to be fatal
        // rather than simulate 4000+ natural starvation ticks. Food/water are
        // explicitly removed from real depots to prevent a last-tick meal.
        const room = g.rooms.rooms[0];
        if (cause === 'starvation') {
          fund(g, room, { ...room.stock, carbs: 0 });
          g.lifecycle.queenHealth.hunger = LIFE.queenStarve;
          g.lifecycle.queenHealth.thirst = 0;
        } else {
          fund(g, room, { ...room.stock, water: 0 });
          g.lifecycle.queenHealth.thirst = LIFE.queenStarve + 600;
          g.lifecycle.queenHealth.hunger = 0;
        }
      } else {
        // Boundary fixture: teleport one REAL Combat.spawn raider onto the queen
        // and set lethal queen HP. Keep other live ant targets on the surface.
        // The lethal damage MUST be executed by unmodified Combat.enemyTick.
        for (const worker of g.colony.workers) {
          worker.layer = SURFACE;
          worker.x = 0;
          worker.y = 0;
          worker.next = null;
          worker.path = [];
        }
        const q = g.colony.queen;
        const attacker = g.combat.spawn('raider', UNDERGROUND, q.x, q.y);
        assert.ok(attacker, 'spawn real combat enemy on walkable queen location');
        attacker.cooldown = 0;
        g.combat.queenHP = 1;
      }
      const tickBefore = g.clock.ticks;
      assert.equal(g.update(TICK_MS), 1, 'actual fatal Game step executed');
      assert.equal(g.clock.ticks, tickBefore + 1);
      assert.equal(g.colony.queen.alive, false);
      assert.equal(g.defeat.cause, cause);
      assert.equal(g.defeat.tick, tickBefore + 1);
      assert.equal(g.research.hasCompleted('foraging_routes'), false);
      const after = g.research.snapshot();
      assert.equal(after.active?.progressTicks, 599,
        'fatal tick must never finish the N=600 research project');
      assert.deepEqual(g.research.held, beforeHeld);
      assert.deepEqual(g.research.spent, ZERO);
      assert.equal(after.refundPreview, null);
      assert.equal(g.research.cancel(runId).error.code, 'GAME_OVER');
      assert.equal(g.research.start('excavation_tools').error.code, 'GAME_OVER');
      assert.equal(observerCalls, paused ? 0 : 1,
        'pause stops following systems; offline mode continues observers');
      const frozenTick = g.clock.ticks;
      if (paused) {
        assert.equal(g.clock.speed, 0);
        assert.equal(g.update(250), 0);
        assert.equal(g.clock.ticks, frozenTick);
      } else {
        assert.equal(g.update(200), 2, 'offline still steps after terminal death');
        assert.equal(g.clock.ticks, frozenTick + 2);
      }
      assert.equal(g.research.snapshot().active.progressTicks, 599);
      assert.deepEqual(g.research.held, beforeHeld);
      assert.deepEqual(g.research.spent, ZERO);
    });
  }
}

for (const entry of RESEARCH_CATALOG) {
  test('CP-A-G3 actual Game ' + entry.id + ' exact N=' + entry.totalTicks +
    ', prerequisites, next-consumer-tick and 0% post-completion refund', () => {
    const g = game('CP-A-G3-CATALOG-' + entry.id);
    const locked = entry.prerequisiteIds.length !== 0;
    const initial = g.research.snapshot();
    const row = initial.technologies.find(t => t.id === entry.id);
    assert.equal(row.status, locked ? 'LOCKED' : 'AVAILABLE');
    assert.equal(row.canStart, false, 'no starting physical stock');
    const initialResult = g.research.start(entry.id);
    assert.equal(initialResult.error.code, locked ?
      'PREREQUISITE_LOCKED' : 'INSUFFICIENT_RESOURCES');
    const unchanged = g.research.snapshot();
    assert.equal(unchanged.revision, 0);
    assert.deepEqual(unchanged.held, ZERO);
    completePrerequisites(g, entry.id);
    const required = RESEARCH_CATALOG.find(x => x.id === entry.id);
    fund(g, g.rooms.rooms[0], { carbs: 24, protein: 24, water: 24 });
    const pre = g.research.snapshot();
    assert.equal(pre.technologies.find(t => t.id === entry.id).canStart, true);
    const initialMass = mass(g);
    const paid = g.research.start(entry.id);
    assert.equal(paid.ok, true);
    assert.equal(g.research.snapshot().active.status, 'QUEUED');
    assert.equal(g.research.snapshot().active.totalTicks, required.totalTicks);
    assert.deepEqual(g.research.held, entry.cost);
    assert.equal(g.research.start('other_tech').error.code, 'INVALID_TECH');
    assert.equal(g.research.start(entry.id).error.code, 'RESEARCH_ACTIVE');
    assert.equal(g.research.cancel(paid.runId + 1).error.code, 'STALE_RUN_ID');
    invariant(g);
    STEP(g, entry.totalTicks - 1);
    const almost = g.research.snapshot();
    assert.equal(almost.active.progressTicks, entry.totalTicks - 1);
    assert.equal(g.research.hasCompleted(entry.id), false);
    assert.deepEqual(g.research.held, entry.cost);
    assert.equal(g.research.tick(g.clock.ticks), undefined, 'repeated tick does nothing');
    assert.equal(g.research.snapshot().active.progressTicks, entry.totalTicks - 1);
    const beforeSpend = { ...g.research.spent };
    // This observer runs AFTER gameplay consumers. The underlying Foraging
    // system records the pre-research completion bit each simulated step.
    const observed = [];
    const normalForagingTick = g.foraging.tick;
    g.foraging.tick = function (...args) {
      observed.push(g.research.hasCompleted(entry.id));
      return normalForagingTick.apply(this, args);
    };
    STEP(g);
    assert.equal(g.research.hasCompleted(entry.id), true);
    assert.equal(g.research.snapshot().active, null);
    assert.equal(g.research.snapshot().technologies.find(t => t.id === entry.id).status,
      'COMPLETED');
    assert.equal(g.research.start(entry.id).error.code, 'ALREADY_RESEARCHED');
    assert.equal(g.research.cancel(paid.runId).error.code, 'NO_ACTIVE_RESEARCH');
    assert.deepEqual(g.research.held, ZERO);
    for (const type of TYPES) {
      assert.equal(g.research.spent[type], beforeSpend[type] + entry.cost[type],
        'exact held -> spent once');
      assert.equal(mass(g)[type], initialMass[type],
        'per-resource accounting across physical reserve and completion');
    }
    STEP(g);
    g.foraging.tick = normalForagingTick;
    assert.deepEqual(observed, [false, true],
      'effect selectors are false in completion tick consumers, true in tick N+1');
    assert.equal(g.research.tick(g.clock.ticks), undefined);
    assert.equal(g.research.hasCompleted(entry.id), true);
    invariant(g);
    const snapshot = g.research.snapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.technologies[0].cost));
    assert.throws(() => { snapshot.technologies[0].cost.carbs = 100; }, TypeError);
    assert.deepEqual(snapshot.completedIds.includes(entry.id), true);
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot,
      'snapshot stays detached and JSON-serializable');
  });
}

test('CP-A-G3 x0/x1/x2/x4 use actual fixed ticks, not wall time or duplicate tick', () => {
  const g = game('CP-A-G3-SPEED');
  fund(g, g.rooms.rooms[0], { carbs: 20, protein: 20, water: 20 });
  assert.equal(g.research.start('foraging_routes').ok, true);
  g.setSpeed(0);
  assert.equal(g.update(250), 0);
  assert.equal(g.clock.ticks, 0);
  assert.equal(g.research.snapshot().active.progressTicks, 0);
  for (const [speed, ticks] of [[1, 1], [2, 2], [4, 4]]) {
    g.setSpeed(speed);
    const prev = g.clock.ticks;
    const p = g.research.snapshot().active.progressTicks;
    assert.equal(g.update(TICK_MS), ticks);
    assert.equal(g.clock.ticks, prev + ticks);
    assert.equal(g.research.snapshot().active.progressTicks, p + ticks);
    assert.equal(g.research.tick(g.clock.ticks), undefined);
    assert.equal(g.research.snapshot().active.progressTicks, p + ticks);
  }
  g.setSpeed(0);
  assert.equal(g.update(1000), 0);
  assert.equal(g.research.snapshot().active.progressTicks, 7);
  invariant(g);
});

test('CP-A-G3 real constructed depot: exact source refund disconnected, deleted-source escrow, new runId', () => {
  const g = game('CP-B-G3-PHYSICAL');
  const queen = g.rooms.rooms[0];
  fund(g, queen, { carbs: 23, protein: 23, water: 23 });
  const q = g.colony.queen;
  let candidate = null;
  for (let radius = 2; radius <= 15 && !candidate; radius++)
    for (let dy = -radius; dy <= radius && !candidate; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = q.x + dx, y = q.y + dy;
        if (g.rooms.validate('food_store', x, y).ok) { candidate = { x, y }; break; }
      }
  assert.ok(candidate, 'reachable room construction site exists');
  const request = g.rooms.queue('food_store', candidate.x, candidate.y);
  assert.equal(request.ok, true);
  for (let tick = 0; tick < 700 && request.room.status !== 'ready'; tick++) STEP(g);
  const store = request.room;
  assert.equal(store.status, 'ready', 'physically constructed from actual Game worker ticks');
  assert.equal(store.connected, true);
  fund(g, queen, { carbs: 3, protein: 2, water: 8 });
  fund(g, store, { carbs: 20, protein: 20, water: 0 });
  const before = Object.fromEntries([queen, store].map(r => [r.id, { ...r.stock }]));
  const total = mass(g);
  const first = g.research.start('foraging_routes');
  assert.equal(first.ok, true);
  const pickups = g.research.snapshot().active.pickups;
  assert.ok(pickups.some(p => p.sourceRoomId === store.id && p.amount > 0));
  assert.ok(pickups.some(p => p.sourceRoomId === queen.id && p.amount > 0));
  assert.equal(g.research.cancel(first.runId + 1).error.code, 'STALE_RUN_ID');
  store.connected = false;
  assert.equal(g.research.cancel(first.runId).ok, true);
  assert.deepEqual(queen.stock, before[queen.id]);
  assert.deepEqual(store.stock, before[store.id]);
  invariant(g);
  assert.deepEqual(mass(g), total);
  store.connected = true;
  const second = g.research.start('foraging_routes');
  assert.equal(second.ok, true);
  assert.ok(second.runId > first.runId, 'retry must allocate fresh monotonic runId');
  const removed = g.rooms.rooms.splice(g.rooms.rooms.indexOf(store), 1);
  const held = { ...g.research.held };
  const spent = { ...g.research.spent };
  const originalActive = structuredClone(g.research.snapshot().active);
  assert.equal(g.research.cancel(second.runId).error.code, 'REFUND_SOURCE_UNAVAILABLE');
  assert.deepEqual(g.research.held, held);
  assert.deepEqual(g.research.spent, spent);
  assert.deepEqual(g.research.snapshot().active, originalActive);
  assert.equal(g.research.snapshot().refundPreview, null);
  g.rooms.rooms.push(...removed);
  assert.equal(g.research.cancel(second.runId).ok, true);
  assert.deepEqual(queen.stock, before[queen.id]);
  assert.deepEqual(store.stock, before[store.id]);
  assert.deepEqual(mass(g), total);
  invariant(g);
});

test('CP-A-G3 immutable invalid/locked/insufficient status produces zero economy mutations and reset clears Research', () => {
  const g = game('CP-A-G3-REJECT');
  const before = g.research.snapshot();
  const originalStocks = g.rooms.rooms.map(r => ({ ...r.stock }));
  const inventory = { ...g.foraging.inventory };
  assert.equal(g.research.start('does_not_exist').error.code, 'INVALID_TECH');
  assert.equal(g.research.start('soldier_armor').error.code, 'PREREQUISITE_LOCKED');
  assert.equal(g.research.start('foraging_routes').error.code, 'INSUFFICIENT_RESOURCES');
  assert.deepEqual(g.research.snapshot(), before);
  assert.deepEqual(g.rooms.rooms.map(r => ({ ...r.stock })), originalStocks);
  assert.deepEqual(g.foraging.inventory, inventory);
  fund(g, g.rooms.rooms[0], { carbs: 12, protein: 11, water: 10 });
  const opened = g.research.start('excavation_tools');
  assert.equal(opened.ok, true);
  assert.equal(g.research.start('foraging_routes').error.code, 'RESEARCH_ACTIVE');
  assert.equal(g.research.cancel(opened.runId).ok, true);
  assert.equal(g.research.cancel(opened.runId).error.code, 'NO_ACTIVE_RESEARCH');
  const restarted = game('CP-A-G3-REJECT');
  assert.deepEqual(restarted.research.snapshot().completedIds, []);
  assert.equal(restarted.research.snapshot().active, null);
  assert.deepEqual(restarted.research.spent, ZERO);
  assert.deepEqual(restarted.research.held, ZERO);
  assert.notEqual(restarted.research, g.research);
});
