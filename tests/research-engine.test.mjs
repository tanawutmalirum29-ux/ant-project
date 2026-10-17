import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Research, RESEARCH_CATALOG } from '../src/core/research.js';

const TYPES = ['carbs', 'protein', 'water'];
const TECH = 'foraging_routes';
const amounts = (carbs = 0, protein = 0, water = 0) => ({ carbs, protein, water });

function makeHarness({
  queen = amounts(10, 10, 10),
  food = amounts(),
  water = amounts(),
  catalog = RESEARCH_CATALOG,
  queenAlive = true
} = {}) {
  const rooms = {
    rooms: [
      { id: 'room-queen', type: 'queen', status: 'ready', connected: true,
        stock: { ...queen } },
      { id: 'room-food', type: 'food_store', status: 'ready', connected: true,
        stock: { ...food }, capacity: { carbs: 40, protein: 40 } },
      { id: 'room-water', type: 'water_store', status: 'ready', connected: true,
        stock: { ...water }, capacity: { water: 50 } }
    ],
    lifecycle: { eggOrders: [] },
    storageSlots(type) {
      return this.rooms.filter(room => room.status === 'ready' && room.connected &&
        (room.type === 'queen' || (type === 'water' ?
          room.type === 'water_store' : room.type === 'food_store')))
        .map(room => ({ room, space: 50 }));
    }
  };
  const foraging = {
    inventory: amounts(queen.carbs + food.carbs, queen.protein + food.protein,
      queen.water + water.water),
    tickCount: 0
  };
  const colony = { queen: { alive: queenAlive } };
  const state = { defeated: false };
  const research = new Research({ rooms, foraging, colony,
    isDefeated: () => state.defeated, catalog });
  return { research, rooms, foraging, colony, state };
}

function currentStock(rooms) {
  return Object.fromEntries(TYPES.map(type => [type,
    rooms.rooms.reduce((sum, room) => sum + room.stock[type], 0)]));
}
function assertConserved(fixture, opening) {
  const { research, rooms, foraging } = fixture;
  assert.deepEqual(currentStock(rooms), foraging.inventory);
  for (const type of TYPES)
    assert.equal(foraging.inventory[type] + research.held[type] + research.spent[type],
      opening[type], 'mass conserved: ' + type);
}
function customCatalog(ticks = 3) {
  return [{ id: 'first', title: 'First', description: 'First experiment',
    effectLabel: '+1', prerequisiteIds: [], cost: amounts(2, 2, 1), totalTicks: ticks },
  { id: 'second', title: 'Second', description: 'Second experiment',
    effectLabel: '+2', prerequisiteIds: ['first'],
    cost: amounts(3, 1, 2), totalTicks: 2 }];
}

test('CP-A01 G1 frozen six-tech catalog, order, prerequisites, costs and immutable definitions', () => {
  assert.deepEqual(RESEARCH_CATALOG.map(t => t.id), [
    'foraging_routes', 'excavation_tools', 'construction_techniques',
    'nursery_care', 'warehouse_extension', 'soldier_armor'
  ]);
  assert.deepEqual(RESEARCH_CATALOG.map(t => [t.cost.carbs, t.cost.protein,
    t.cost.water, t.totalTicks]), [
    [6, 4, 3, 600], [8, 5, 4, 800], [8, 6, 5, 900],
    [9, 8, 7, 1100], [10, 6, 8, 1050], [9, 12, 8, 1400]
  ]);
  assert.deepEqual(RESEARCH_CATALOG.find(t => t.id === 'warehouse_extension')
    .prerequisiteIds, ['foraging_routes']);
  assert.ok(Object.isFrozen(RESEARCH_CATALOG));
  assert.ok(Object.isFrozen(RESEARCH_CATALOG[0].cost));
  assert.ok(Object.isFrozen(RESEARCH_CATALOG[0].prerequisiteIds));
  const f = makeHarness();
  assert.equal(f.research.snapshot().technologies.length, 6);
  assert.equal(f.research.hasCompleted('foraging_routes'), false);
});

test('CP-A02 starting is atomic across THREE types; invalid, locked and incomplete stock do not mutate', () => {
  const f = makeHarness({ queen: amounts(22, 5, 2) });
  const before = structuredClone(f.foraging.inventory);
  const orig = structuredClone(f.rooms.rooms);
  assert.equal(f.research.start('unknown').error.code, 'INVALID_TECH');
  assert.equal(f.research.start('construction_techniques').error.code, 'PREREQUISITE_LOCKED');
  assert.equal(f.research.start(TECH).error.code, 'INSUFFICIENT_RESOURCES');
  assert.deepEqual(f.foraging.inventory, before);
  assert.deepEqual(f.rooms.rooms, orig);
  assert.deepEqual(f.research.held, amounts());
  assert.equal(f.research.snapshot().revision, 0);
  assert.equal(f.research.snapshot().technologies.find(t => t.id === TECH)
    .missingResources.water, 1);
});

test('CP-A03 physical deterministic multi-room pickups debit source stock and aggregate exactly once', () => {
  const f = makeHarness({
    queen: amounts(5, 2, 2), food: amounts(6, 4, 0), water: amounts(0, 0, 5)
  });
  const opening = { ...f.foraging.inventory };
  const r = f.research.start(TECH);
  assert.deepEqual(r, { ok: true, runId: 1 });
  const active = f.research.snapshot().active;
  assert.equal(active.status, 'QUEUED');
  assert.equal(active.startedTick, 0);
  assert.equal(active.progressTicks, 0);
  assert.deepEqual(active.pickups, [
    { sourceRoomId: 'room-queen', type: 'carbs', amount: 5 },
    { sourceRoomId: 'room-food', type: 'carbs', amount: 1 },
    { sourceRoomId: 'room-queen', type: 'protein', amount: 2 },
    { sourceRoomId: 'room-food', type: 'protein', amount: 2 },
    { sourceRoomId: 'room-queen', type: 'water', amount: 2 },
    { sourceRoomId: 'room-water', type: 'water', amount: 1 }
  ]);
  assert.deepEqual(f.research.held, amounts(6, 4, 3));
  assert.deepEqual(f.research.spent, amounts());
  assert.equal(f.research.refundableFor('room-queen', 'carbs'), 5);
  assert.equal(f.research.refundableFor('room-food', 'protein'), 2);
  assert.deepEqual(f.research.snapshot().refundPreview, amounts(6, 4, 3));
  assert.equal(f.research.start('excavation_tools').error.code, 'RESEARCH_ACTIVE');
  assertConserved(f, opening);
});

test('CP-A04 mid-research cancellation refunds exact source without partial or duplicate refund', () => {
  const f = makeHarness({ queen: amounts(6, 5, 4) });
  const opening = { ...f.foraging.inventory };
  assert.deepEqual(f.research.start(TECH), { ok: true, runId: 1 });
  for (let t = 1; t <= 125; t++) f.research.tick(t);
  assert.equal(f.research.snapshot().active.progressTicks, 125);
  assert.equal(f.research.cancel(9).error.code, 'STALE_RUN_ID');
  assert.deepEqual(f.research.cancel(1), { ok: true, runId: 1 });
  assertConserved(f, opening);
  assert.deepEqual(f.foraging.inventory, opening);
  assert.deepEqual(f.research.held, amounts());
  assert.deepEqual(f.research.spent, amounts());
  assert.equal(f.research.cancel(1).error.code, 'NO_ACTIVE_RESEARCH');
  assert.equal(f.research.start(TECH).runId, 2);
  assert.equal(f.research.snapshot().active.progressTicks, 0);
  assertConserved(f, opening);
});

test('CP-A05 immutable detached snapshot, truthful statuses, safe invalid/replayed ticks and exact completion', () => {
  const f = makeHarness({ catalog: customCatalog() });
  let before = f.research.snapshot();
  assert.equal(before.technologies[0].status, 'AVAILABLE');
  assert.equal(before.technologies[1].status, 'LOCKED');
  assert.equal(before.technologies[0].canStart, true);
  const r = f.research.start('first');
  assert.equal(r.runId, 1);
  const queued = f.research.snapshot();
  assert.ok(Object.isFrozen(queued.active.pickups));
  assert.ok(Object.isFrozen(queued.technologies[0].cost));
  assert.throws(() => { queued.technologies[0].cost.carbs = 500; }, TypeError);
  assert.throws(() => { queued.active.pickups.push({}); }, TypeError);
  f.research.tick(0);
  f.research.tick(-1);
  f.research.tick(0.25);
  f.research.tick(1);
  f.research.tick(1);
  assert.equal(f.research.snapshot().active.progressTicks, 1);
  f.research.tick(2);
  assert.equal(f.research.hasCompleted('first'), false);
  f.research.tick(3);
  assert.equal(f.research.hasCompleted('first'), true);
  assert.equal(f.research.snapshot().active, null);
  assert.deepEqual(f.research.spent, amounts(2, 2, 1));
  assert.equal(f.research.start('first').error.code, 'ALREADY_RESEARCHED');
  f.research.tick(3);
  f.research.tick(4);
  assert.deepEqual(f.research.spent, amounts(2, 2, 1));
  before = f.research.snapshot();
  assert.deepEqual(before.completedIds, ['first']);
  assert.equal(before.technologies[1].status, 'AVAILABLE');
  assert.equal(before.technologies[1].canStart, true);
  assert.equal(f.research.start('second').runId, 2);
  assert.equal(f.research.snapshot().revision > queued.revision, true);
});

test('CP-A06 refund escrow: removed source, overfilled depot or competing reservations block ALL refunds', () => {
  const f = makeHarness({ queen: amounts(10, 10, 10) });
  const opening = { ...f.foraging.inventory };
  const runId = f.research.start(TECH).runId;
  const queen = f.rooms.rooms[0];
  const initialRemaining = { ...queen.stock };
  f.rooms.rooms.splice(0, 1);
  assert.equal(f.research.snapshot().refundPreview, null);
  assert.equal(f.research.cancel(runId).error.code, 'REFUND_SOURCE_UNAVAILABLE');
  assert.deepEqual(f.research.held, amounts(6, 4, 3));
  f.rooms.rooms.unshift(queen);
  Object.assign(queen.stock, { carbs: 24, protein: 24, water: 24 });
  f.foraging.inventory = currentStock(f.rooms);
  assert.equal(f.research.cancel(runId).error.code, 'REFUND_SOURCE_UNAVAILABLE');
  assert.deepEqual(queen.stock, amounts(24, 24, 24));
  Object.assign(queen.stock, initialRemaining);
  f.foraging.inventory = currentStock(f.rooms);
  f.rooms.lifecycle.eggOrders.push({
    status: 'QUEUED', pickups: [{ sourceRoomId: queen.id, type: 'carbs', amount: 22 }]
  });
  assert.equal(f.research.cancel(runId).error.code, 'REFUND_SOURCE_UNAVAILABLE');
  f.rooms.lifecycle.eggOrders.length = 0;
  assert.deepEqual(f.research.cancel(runId), { ok: true, runId });
  assertConserved(f, opening);
});

test('CP-A07 physically disconnected depot stock cannot fund research, but original detached depot refunds work', () => {
  const f = makeHarness({
    queen: amounts(), food: amounts(10, 10, 0), water: amounts(0, 0, 10)
  });
  f.rooms.rooms[1].connected = false;
  assert.equal(f.research.start(TECH).error.code, 'INSUFFICIENT_RESOURCES');
  f.rooms.rooms[1].connected = true;
  assert.equal(f.research.start(TECH).runId, 1);
  f.rooms.rooms[1].connected = false;
  f.rooms.rooms[2].connected = false;
  assert.deepEqual(f.research.cancel(1), { ok: true, runId: 1 });
  assert.equal(f.rooms.rooms[1].stock.carbs, 10);
  assert.equal(f.rooms.rooms[2].stock.water, 10);
});

test('CP-A08 terminal queen defeat freezes held research even in continued offline simulated ticks', () => {
  for (const byQueen of [true, false]) {
    const f = makeHarness({ catalog: customCatalog(2) });
    assert.equal(f.research.start('first').runId, 1);
    f.research.tick(1);
    if (byQueen) f.colony.queen.alive = false;
    else f.state.defeated = true;
    f.research.tick(2);
    f.research.tick(30000);
    assert.equal(f.research.hasCompleted('first'), false);
    assert.equal(f.research.snapshot().active.progressTicks, 1);
    assert.deepEqual(f.research.held, amounts(2, 2, 1));
    assert.deepEqual(f.research.spent, amounts());
    assert.equal(f.research.start('second').error.code, 'GAME_OVER');
    assert.equal(f.research.cancel(1).error.code, 'GAME_OVER');
  }
});

test('CP-A09 validate catalog unknown prereqs, cycles, duplicates and unsafe numeric costs', () => {
  const overrides = [
    [customCatalog()[0], customCatalog()[0]],
    [{ ...customCatalog()[0], prerequisiteIds: ['other'] }],
    [{ ...customCatalog()[0], prerequisiteIds: ['first'] }],
    [{ ...customCatalog()[0], cost: amounts(-1, 2, 1) }],
    [{ ...customCatalog()[0], cost: amounts(2.5, 2, 1) }],
    [{ ...customCatalog()[0], totalTicks: Number.MAX_SAFE_INTEGER + 1 }]
  ];
  for (const catalog of overrides)
    assert.throws(() => makeHarness({ catalog }), TypeError);
});

test('CP-A10 native Game initial stock is ZERO and new seeded Game has fresh Research and ledgers', () => {
  for (const seed of ['ANT-001', 'CP-A-SEED-01']) {
    const first = new Game(seed);
    const research = new Research({
      rooms: first.rooms, foraging: first.foraging, colony: first.colony,
      isDefeated: () => !!first.defeat || first.colony.queen.alive === false
    });
    assert.deepEqual(first.foraging.inventory, amounts());
    assert.equal(research.start(TECH).error.code, 'INSUFFICIENT_RESOURCES');
    first.foraging.inventory = amounts(6, 4, 3);
    first.rooms.syncInventory();
    assert.equal(research.start(TECH).runId, 1);
    assert.equal(research.snapshot().active.status, 'QUEUED');
    const restarted = new Game(seed);
    const fresh = new Research({
      rooms: restarted.rooms, foraging: restarted.foraging, colony: restarted.colony,
      isDefeated: () => !!restarted.defeat || restarted.colony.queen.alive === false
    });
    assert.equal(fresh.snapshot().active, null);
    assert.deepEqual(fresh.snapshot().completedIds, []);
    assert.deepEqual(fresh.held, amounts());
    assert.deepEqual(fresh.spent, amounts());
    assert.deepEqual(restarted.foraging.inventory, amounts());
  }
});

test('CP-A11 read-only warehouse upgrade cap and competing unfinished construction claims', () => {
  const f = makeHarness({
    queen: amounts(14, 12, 12), food: amounts(12, 0, 0),
    catalog: customCatalog()
  });
  const project = f.research.start('first');
  assert.equal(project.ok, true);
  const queen = f.rooms.rooms[0];
  const original = { ...queen.stock };
  f.rooms.rooms.push({ id: 'room-build', type: 'nursery', status: 'planned',
    stock: amounts(), pickups: [
      { sourceRoomId: queen.id, type: 'carbs', amount: 10 }
    ] });
  assert.equal(f.research.cancel(project.runId).error.code, 'REFUND_SOURCE_UNAVAILABLE');
  assert.deepEqual(queen.stock, original);
  f.rooms.rooms.pop();
  assert.equal(f.research.cancel(project.runId).ok, true);
});
