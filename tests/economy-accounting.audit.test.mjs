// P1-ECO-01 — test-only, pinned baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237.
// Assertions cover physical source/cargo/storage movements and independent mass ledgers.
// Test fixtures that inject stock record the exact injected units; reservations are NOT stock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { SURFACE, UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';
import { CARRY_CAPACITY } from '../src/core/foraging.js';
import { BASE_CAPACITY, ROOM_CATALOG } from '../src/core/rooms.js';

const SEED = 'P1-ECO-01';
const injections = new WeakMap();
const zeros = () => Object.fromEntries(RESOURCE_TYPES.map(type => [type, 0]));
const tick = (game, n = 1) => {
  for (let i = 0; i < n; i++) assert.equal(game.update(100), 1, 'one 100ms frame must advance one tick at x1');
};
function initial(game) {
  return Object.fromEntries(RESOURCE_TYPES.map(type => [
    type, game.foraging.nodes.filter(node => node.type === type)
      .reduce((total, node) => total + node.initialAmount, 0)
  ]));
}
function inject(game, amounts) {
  let recorded = injections.get(game);
  if (!recorded) { recorded = zeros(); injections.set(game, recorded); }
  for (const type of RESOURCE_TYPES) {
    const amount = amounts[type] || 0;
    assert.ok(Number.isSafeInteger(amount) && amount >= 0, 'fixture additions must be explicit integers');
    game.foraging.inventory[type] += amount;
    recorded[type] += amount;
  }
  game.rooms.syncInventory();
}
function components(game, type) {
  return {
    source: game.foraging.nodes.filter(node => node.type === type).reduce((s, n) => s + n.amount, 0),
    cargo: game.colony.workers.reduce((s, ant) => s + (ant.cargo?.type === type ? ant.cargo.amount : 0), 0),
    inventory: game.foraging.inventory[type],
    consumed: game.lifecycle.consumed[type],
    lost: game.lifecycle.lost[type],
    held: game.rooms.held[type],
    spent: game.rooms.spent[type]
  };
}
function audit(game, context = '') {
  const base = initial(game);
  const added = injections.get(game) || zeros();
  for (const type of RESOURCE_TYPES) {
    const row = components(game, type);
    const expected = base[type] + added[type] + game.ecology.regenerated[type];
    const actual = Object.values(row).reduce((sum, n) => sum + n, 0);
    for (const [part, amount] of Object.entries(row)) {
      assert.ok(Number.isSafeInteger(amount) && amount >= 0,
        context + ' tick=' + game.clock.ticks + ' ' + type + '.' + part + '=' + amount);
    }
    assert.equal(actual, expected, context + ' tick=' + game.clock.ticks +
      ' resource=' + type + ' expected=' + expected + ' ledger=' + JSON.stringify(row));
    const roomTotal = game.rooms.rooms.reduce((s, room) => s + (room.stock?.[type] || 0), 0);
    assert.equal(roomTotal, game.foraging.inventory[type],
      context + ' tick=' + game.clock.ticks + ' storage mismatch for ' + type);
    const slots = game.rooms.storageSlots(type);
    for (const { room, space } of slots) {
      const capacity = room.type === 'queen' ? BASE_CAPACITY[type] : (ROOM_CATALOG[room.type].capacity[type] || 0);
      assert.ok(room.stock[type] <= capacity && space >= 0,
        context + ' tick=' + game.clock.ticks + ' overfilled room ' + room.id + ' ' + type);
    }
  }
  for (const node of game.foraging.nodes) {
    assert.ok(Number.isSafeInteger(node.amount) && node.amount >= 0);
    assert.ok(Number.isSafeInteger(node.reserved) && node.reserved >= 0 && node.reserved <= node.amount,
      context + ' tick=' + game.clock.ticks + ' invalid reservation on ' + node.id);
    const assigned = game.colony.workers.reduce((s, ant) =>
      s + (ant.resourceId === node.id ? (ant.reservedAmount || 0) : 0), 0);
    assert.equal(node.reserved, assigned,
      context + ' tick=' + game.clock.ticks + ' stale/duplicate reservation ' + node.id);
  }
  for (const ant of game.colony.workers) {
    if (ant.cargo) {
      assert.ok(ant.cargo.amount > 0 && ant.cargo.amount <= CARRY_CAPACITY,
        context + ' tick=' + game.clock.ticks + ' invalid carry ' + ant.id);
      assert.ok(RESOURCE_TYPES.includes(ant.cargo.type));
    }
  }
}
function funded(seed, amounts = { carbs: 20, protein: 20, water: 20 }) {
  const game = new Game(seed);
  game.colony.setForageSlots(0);
  game.lifecycle.setNurseSlots(0);
  inject(game, amounts);
  audit(game, 'funded');
  return game;
}
function queue(game, type, dx = 2, dy = 0) {
  const result = game.rooms.queue(type, game.colony.queen.x + dx, game.colony.queen.y + dy);
  assert.equal(result.ok, true, 'room placement failed: ' + type + ' / ' + result.reason);
  return result.room;
}
function physicalAnt(game) {
  return game.colony.workers.find(ant => ant.combatRole !== 'soldier') || game.colony.workers[0];
}
function debitSourceForFixture(game, type, amount) {
  const node = game.foraging.nodes.find(source => source.type === type && source.amount >= amount);
  assert.ok(node, 'fixture requires actual source mass of ' + type);
  node.amount -= amount;
  return node;
}

test('ECO-01 initial per-type source stock is conserved and reservations do not count twice', () => {
  for (const seed of ['ANT-001', SEED, 'old-case', 'u5r-build']) {
    const game = new Game(seed);
    const byType = initial(game);
    assert.ok(RESOURCE_TYPES.every(type => byType[type] > 0), seed);
    audit(game, seed + ' initial');
    game.colony.setForageSlots(2);
    tick(game, 2);
    assert.ok(game.foraging.nodes.some(node => node.reserved > 0), seed + ': no source reserved');
    assert.equal(RESOURCE_TYPES.reduce((s, type) => s + game.foraging.inventory[type], 0), 0);
    audit(game, seed + ' reserved');
  }
});

test('ECO-02 zero natural sources cannot produce free cargo, reservations or inventory', () => {
  const game = new Game('P1-ECO-01-zero');
  game.foraging.nodes.forEach(node => { node.amount = 0; node.initialAmount = 0; node.reserved = 0; });
  game.colony.setForageSlots(2);
  tick(game, 80);
  assert.equal(game.foraging.activeCount, 0);
  assert.ok(game.colony.workers.every(ant => !ant.cargo && !ant.resourceId));
  audit(game, 'zero-resource world');
});

test('ECO-03 physical pickup and portal travel precede inventory deposit', () => {
  const game = new Game('P1-ECO-01-transport');
  game.colony.setForageSlots(1);
  const ant = game.colony.workers.at(-1);
  const entry = game.world.entrances[0];
  let visitedSurface = false, carried = false, returned = false, deposited = false;
  for (let step = 0; step < 800; step++) {
    const before = { x: ant.x, y: ant.y, layer: ant.layer };
    tick(game);
    if (before.layer !== ant.layer) {
      // A single fixed tick may finish the final cardinal step onto the portal
      // AND cross layers; pre-tick position may be exactly one tile away.
      const origin = before.layer === UNDERGROUND ? entry.underground : entry.surface;
      assert.ok(Math.abs(before.x - origin.x) + Math.abs(before.y - origin.y) <= 1,
        'portal crossing must begin on/adjacent to its entrance, never remotely');
      assert.equal(ant.x, ant.layer === UNDERGROUND ? entry.underground.x : entry.surface.x);
      assert.equal(ant.y, ant.layer === UNDERGROUND ? entry.underground.y : entry.surface.y);
    } else {
      const distance = Math.abs(ant.x - before.x) + Math.abs(ant.y - before.y);
      assert.ok(distance <= 1, 'non-cardinal or multi-cell jump at tick ' + game.clock.ticks);
    }
    if (ant.layer === SURFACE) visitedSurface = true;
    if (ant.cargo?.amount) {
      carried = true;
      assert.equal(game.foraging.inventory[ant.cargo.type], 0,
        'source harvest must not grant inventory before warehouse visit');
      if (ant.layer === UNDERGROUND) returned = true;
    }
    audit(game, 'physical transport');
    if (game.foraging.delivered > 0) { deposited = true; break; }
  }
  assert.ok(visitedSurface && carried && returned && deposited,
    'forager never completed real source / portal / storage route');
  assert.ok(game.foraging.completedTrips >= 1);
});

test('ECO-04 multiple source reservations release on worker death without resource creation', () => {
  const game = new Game('P1-ECO-01-reserve-death');
  game.colony.setForageSlots(2);
  tick(game, 2);
  const assigned = game.colony.workers.filter(ant => ant.resourceId);
  assert.ok(assigned.length > 0);
  const dying = assigned[0];
  const source = game.foraging.nodes.find(node => node.id === dying.resourceId);
  const amount = dying.reservedAmount;
  const before = source.amount;
  assert.equal(game.lifecycle.killWorker(dying), true);
  assert.equal(source.amount, before, 'death during reservation must not harvest source');
  assert.equal(source.reserved,
    game.colony.workers.reduce((n, w) => n + (w.resourceId === source.id ? (w.reservedAmount || 0) : 0), 0));
  assert.ok(amount > 0);
  audit(game, 'reserved ant death');
});

test('ECO-05 loaded forager death books exactly the lost cargo, not inventory', () => {
  const game = new Game('P1-ECO-01-loaded-death');
  game.colony.setForageSlots(1);
  const ant = game.colony.workers.at(-1);
  for (let step = 0; step < 650 && !ant.cargo?.amount; step++) tick(game);
  assert.ok(ant.cargo?.amount, 'forager never harvested source');
  const type = ant.cargo.type;
  const quantity = ant.cargo.amount;
  const lostBefore = game.lifecycle.lost[type];
  const inventoryBefore = game.foraging.inventory[type];
  assert.equal(game.lifecycle.killWorker(ant), true);
  assert.equal(game.lifecycle.lost[type], lostBefore + quantity);
  assert.equal(game.foraging.inventory[type], inventoryBefore);
  assert.equal(game.colony.workers.includes(ant), false);
  audit(game, 'loaded worker death');
});

test('ECO-06 dead construction carrier leaves recoverable pickups and no phantom stock', () => {
  const game = funded('u5r-worker-death');
  const room = queue(game, 'food_store');
  const heldBefore = { ...game.rooms.held };
  let carrier = null;
  for (let i = 0; i < 80; i++) {
    tick(game);
    carrier = game.colony.workers.find(ant => ant.roomId === room.id);
    if (carrier && room.pickups.some(p => p.collected)) break;
  }
  assert.ok(carrier && room.pickups.some(p => p.collected),
    'builder has not physically collected a pickup');
  const position = { x: carrier.x, y: carrier.y };
  game.lifecycle.killWorker(carrier);
  assert.equal(room.status, 'planned');
  assert.equal(room.workerId, null);
  assert.ok(room.pickups.every(p => !p.collected && p.x === position.x && p.y === position.y),
    'carried building materials must remain recoverable at actual death tile');
  assert.deepEqual(game.rooms.held, heldBefore);
  audit(game, 'builder death');
  tick(game, 310);
  assert.equal(room.status, 'ready', 'replacement must physically finish building');
  assert.equal(game.rooms.held.carbs, 0);
  assert.equal(game.rooms.spent.carbs, ROOM_CATALOG.food_store.cost.carbs);
  audit(game, 'builder replacement');
});

test('ECO-07 multiple construction orders, overlap rejection and cancellation refund exact costs', () => {
  const game = funded('P1-ECO-01-cancel');
  const opening = { ...game.foraging.inventory };
  const a = queue(game, 'food_store', 2, 0);
  const b = queue(game, 'nursery', -4, 0);
  const initialHeld = { ...game.rooms.held };
  assert.equal(initialHeld.carbs, ROOM_CATALOG.food_store.cost.carbs + ROOM_CATALOG.nursery.cost.carbs);
  const duplicate = game.rooms.queue('food_store', a.x, a.y);
  assert.equal(duplicate.ok, false);
  assert.deepEqual(game.rooms.held, initialHeld, 'rejected overlap cannot reserve twice');
  assert.equal(game.rooms.cancel(b.id), true, 'cancel planned room');
  audit(game, 'planned cancellation');
  tick(game, 12);
  assert.equal(a.status, 'building');
  assert.ok(a.progress < ROOM_CATALOG.food_store.ticks, 'building is never instantaneous');
  assert.equal(game.rooms.cancel(a.id), true, 'cancel active builder');
  assert.deepEqual(game.rooms.held, zeros());
  assert.deepEqual(game.foraging.inventory, opening, 'all materials must be refunded exactly once');
  assert.ok(game.colony.workers.every(w => w.roomId !== a.id && w.roomId !== b.id));
  assert.equal(game.rooms.cancel(a.id), false, 'a second cancellation must not refund again');
  audit(game, 'active cancellation and idempotence');
});

test('ECO-08 full storage waits and partial deposit never exceeds per-type capacity', () => {
  const game = new Game('P1-ECO-01-full');
  game.colony.setForageSlots(0);
  game.lifecycle.setNurseSlots(0);
  inject(game, { carbs: BASE_CAPACITY.carbs, protein: BASE_CAPACITY.protein, water: BASE_CAPACITY.water });
  const ant = physicalAnt(game);
  debitSourceForFixture(game, 'water', 3);
  ant.layer = UNDERGROUND; ant.x = game.colony.queen.x; ant.y = game.colony.queen.y;
  ant.orderId = null; ant.state = 'forage-wait-storage'; ant.path = []; ant.next = null; ant.motion = 0;
  ant.cargo = { type: 'water', amount: 3 };
  audit(game, 'full setup');
  assert.equal(game.foraging.pickNode(ant), null, 'no new reservation when all stores are full');
  game.foraging.tick();
  assert.equal(game.foraging.inventory.water, BASE_CAPACITY.water);
  assert.equal(ant.cargo.amount, 3);
  assert.equal(game.foraging.waitingCount, 1);
  assert.equal(game.lifecycle.consume('water', 1), true);
  game.foraging.tick();
  assert.equal(game.foraging.inventory.water, BASE_CAPACITY.water);
  assert.equal(ant.cargo.amount, 2, 'partial deposit must retain remaining carried units');
  assert.equal(game.lifecycle.consumed.water, 1);
  audit(game, 'partial physical deposit');
});

test('ECO-09 disconnected warehouse cannot accept deposit or supply remote consumption', () => {
  const game = funded('u5r-connect', { carbs: 12, protein: 8, water: 0 });
  const room = queue(game, 'water_store');
  tick(game, 220);
  assert.equal(room.status, 'ready');
  const ant = physicalAnt(game);
  ant.state = 'idle'; ant.layer = UNDERGROUND; ant.x = room.x; ant.y = room.y;
  // Direct depot fixture receipt: record the external water input just once.
  inject(game, { water: 5 });
  // Rebase the physical location of the 5 injected units from queen depot to the new warehouse.
  game.rooms.rooms[0].stock.water -= 5;
  room.stock.water += 5;
  assert.equal(game.foraging.inventory.water, 5);
  audit(game, 'connected warehouse stock');
  const layer = game.world.layers[UNDERGROUND];
  const old = cellAt(layer, room.x, room.y);
  writeCell(layer, room.x, room.y, TERRAINS.ROCK);
  game.rooms.updateConnectivity();
  assert.equal(room.status, 'disabled');
  assert.equal(game.rooms.depositAt(ant, 'water', 2, room.id), 0);
  assert.equal(game.rooms.take('water', 1), false,
    'disconnected stock must not pay remote consumers');
  assert.equal(game.lifecycle.consume('water'), false);
  assert.equal(room.stock.water, 5);
  assert.equal(game.foraging.inventory.water, 5);
  audit(game, 'disabled store');
  writeCell(layer, room.x, room.y, old);
  game.rooms.updateConnectivity();
  assert.equal(room.status, 'ready');
  assert.equal(game.lifecycle.consume('water'), true);
  audit(game, 'reconnected warehouse');
});

test('ECO-10 consumption debits inventory and credits consumed by identical amounts', () => {
  const game = funded('P1-ECO-01-consume', { carbs: 8, protein: 4, water: 8 });
  const before = { ...game.foraging.inventory };
  assert.equal(game.lifecycle.consume('carbs', 3), true);
  assert.equal(game.lifecycle.consume('water', 2), true);
  assert.equal(game.lifecycle.consume('protein', 5), false, 'insufficient stock must be atomic');
  assert.equal(game.foraging.inventory.carbs, before.carbs - 3);
  assert.equal(game.foraging.inventory.water, before.water - 2);
  assert.equal(game.foraging.inventory.protein, before.protein);
  assert.equal(game.lifecycle.consumed.carbs, 3);
  assert.equal(game.lifecycle.consumed.water, 2);
  assert.equal(game.lifecycle.consumed.protein, 0);
  audit(game, 'manual consumption');
  // Adult hunger/thirst consumes only previously delivered stock.
  game.lifecycle.queenHealth.hunger = 849;
  game.lifecycle.queenHealth.thirst = 1299;
  const c = { ...game.lifecycle.consumed };
  tick(game);
  assert.equal(game.lifecycle.consumed.carbs, c.carbs + 1);
  assert.equal(game.lifecycle.consumed.water, c.water + 1);
  audit(game, 'actual queen feeding');
});

test('ECO-11 paused simulation freezes source, transport, room and life ledgers', () => {
  const game = funded('P1-ECO-01-pause');
  const room = queue(game, 'rest');
  tick(game, 15);
  assert.ok(room.status === 'building' || room.status === 'planned');
  const snapshot = JSON.stringify({
    workers: game.colony.workers, sources: game.foraging.nodes,
    rooms: game.rooms.rooms, inventory: game.foraging.inventory,
    held: game.rooms.held, spent: game.rooms.spent,
    consumed: game.lifecycle.consumed, lost: game.lifecycle.lost,
    brood: game.lifecycle.brood, clock: game.clock.ticks
  });
  game.setSpeed(0);
  for (let i = 0; i < 200; i++) assert.equal(game.update(100), 0);
  const after = JSON.stringify({
    workers: game.colony.workers, sources: game.foraging.nodes,
    rooms: game.rooms.rooms, inventory: game.foraging.inventory,
    held: game.rooms.held, spent: game.rooms.spent,
    consumed: game.lifecycle.consumed, lost: game.lifecycle.lost,
    brood: game.lifecycle.brood, clock: game.clock.ticks
  });
  assert.equal(after, snapshot);
  audit(game, 'paused');
  game.setSpeed(1);
  tick(game, 2);
  audit(game, 'resumed');
});

test('ECO-12 deterministic 3600-tick stress: forage, brood, deaths, construction and cancellations', () => {
  const game = new Game('P1-ECO-01-stress');
  inject(game, { carbs: 12, protein: 12, water: 12 });
  game.colony.setForageSlots(2);
  const first = queue(game, 'food_store', 2, 0);
  const second = queue(game, 'nursery', -4, 0);
  let deathObserved = false, canceled = false;
  for (let step = 0; step < 3600; step++) {
    if (step === 100) {
      const carrier = game.colony.workers.find(w => w.cargo?.amount);
      if (carrier) { game.lifecycle.killWorker(carrier); deathObserved = true; }
      else {
        const builder = game.colony.workers.find(w => w.roomId);
        if (builder) { game.lifecycle.killWorker(builder); deathObserved = true; }
      }
    }
    if (step === 350 && second.status !== 'ready') {
      assert.equal(game.rooms.cancel(second.id), true);
      canceled = true;
    }
    if (step === 1100) game.toggleLayer();
    if (step === 1150) game.toggleLayer();
    tick(game);
    if (step % 19 === 0 || step === 3599) audit(game, 'stress step=' + step);
  }
  assert.ok(game.foraging.completedTrips > 0);
  assert.ok(game.foraging.delivered > 0);
  assert.ok(game.lifecycle.consumed.carbs > 0);
  assert.ok(game.lifecycle.consumed.protein > 0);
  assert.ok(game.lifecycle.births > 0, 'life cycle must produce adult ants during long simulation');
  assert.ok(deathObserved, 'fixture failed to exercise live worker-death cleanup');
  assert.ok(first.status === 'ready' || game.rooms.spent.carbs >= ROOM_CATALOG.food_store.cost.carbs,
    'at least one building must complete via physical work');
  assert.ok(canceled || second.status === 'ready', 'second room must be built or canceled');
  audit(game, 'final');
});
