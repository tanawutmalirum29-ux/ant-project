import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { COMBAT } from '../src/core/combat.js';
import { SURFACE, UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { DIRECTIONS, findPath, isDiggable, isWalkable, reachablePaths } from '../src/world/navigation.js';

const BASELINE = 'd508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237';
const run = (game, ticks = 1) => {
  for (let i = 0; i < ticks; i++) assert.equal(game.update(100), 1);
};
const pos = ant => ({ layer: ant.layer, x: ant.x, y: ant.y });
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function setup(seed) {
  const game = new Game(seed);
  game.colony.setForageSlots(0);
  game.lifecycle.setNurseSlots(0);
  game.combat.setSoldierSlots(0);
  return game;
}
function frontier(game, minimumDistance = 0) {
  const layer = game.world.layers[UNDERGROUND];
  const reach = game.colony.workers.map(a => reachablePaths(layer, a));
  for (let y = 2; y < layer.height - 2; y++) for (let x = 2; x < layer.width - 2; x++) {
    if (!isDiggable(layer, x, y)) continue;
    let best = Infinity;
    for (const paths of reach) for (const [dx, dy] of DIRECTIONS) {
      const d = paths?.distance(x + dx, y + dy) ?? -1;
      if (d >= 0) best = Math.min(best, d);
    }
    if (best !== Infinity && best >= minimumDistance) return { x, y };
  }
  throw new Error('No reachable dig frontier at required distance');
}
function orderInvariants(game) {
  const ownerIds = new Set();
  const assigned = new Set();
  assert.equal(game.colony.orders.size, game.colony.ordersById.size);
  for (const job of game.colony.orders.values()) {
    assert.strictEqual(game.colony.ordersById.get(job.id), job);
    if (job.workerId == null) continue;
    assert.ok(!ownerIds.has(job.workerId), 'one ant must not own two dig jobs');
    ownerIds.add(job.workerId);
    const worker = game.colony.workers.find(a => a.id === job.workerId);
    assert.ok(worker, 'dig owner must still exist');
    assert.equal(worker.orderId, job.id);
  }
  for (const worker of game.colony.workers) {
    if (worker.orderId == null) continue;
    assert.ok(!assigned.has(worker.orderId), 'a dig order cannot be held twice');
    assigned.add(worker.orderId);
    assert.equal(game.colony.ordersById.get(worker.orderId)?.workerId, worker.id);
    assert.notEqual(worker.combatRole, 'soldier');
    assert.ok(!worker.state.startsWith('forage-'));
  }
}
function mass(game) {
  const values = [];
  values.push(...game.foraging.nodes.map(n => n.amount));
  values.push(...Object.values(game.foraging.inventory));
  values.push(...game.colony.workers.map(a => a.cargo?.amount || 0));
  for (const ledger of [game.lifecycle.consumed, game.lifecycle.lost, game.rooms.held, game.rooms.spent]) {
    values.push(...Object.values(ledger));
  }
  return values.reduce((a, b) => a + b, 0) -
    Object.values(game.ecology.regenerated).reduce((a, b) => a + b, 0);
}
function auditMovement(game, ticks) {
  let previous = new Map(game.colony.workers.map(a => [a.id, pos(a)]));
  const crossings = [];
  const portal = game.world.entrances[0];
  for (let i = 1; i <= ticks; i++) {
    run(game);
    const ids = game.colony.workers.map(a => a.id);
    assert.equal(ids.length, new Set(ids).size, 'duplicate worker id at tick ' + i);
    for (const worker of game.colony.workers) {
      const old = previous.get(worker.id);
      const now = pos(worker);
      assert.ok(isWalkable(game.world.layers[now.layer], now.x, now.y),
        'worker on blocked tile at tick ' + i + ': ' + worker.id);
      if (old) {
        if (old.layer === now.layer) {
          assert.ok(distance(old, now) <= 1, 'non-cardinal teleport at tick ' + i + ': ' + worker.id);
        } else {
          // Foraging.walk can finish its last cardinal step INTO the entrance
          // and immediately cross layers in the very same Game.update(100).
          // Combat crosses only when already at the entrance on tick entry.
          const exitDistance = distance(old, portal[old.layer]);
          const forageStepIntoPortal = exitDistance === 1 && worker.state.startsWith('forage-') &&
            worker.combatRole !== 'soldier';
          assert.ok(exitDistance === 0 || forageStepIntoPortal,
            'layer exit without a real entrance/adjacent step at tick ' + i + ': ' + worker.id);
          assert.deepEqual(now, { layer: now.layer, ...portal[now.layer] },
            'layer arrival without portal at tick ' + i + ': ' + worker.id);
          assert.equal(worker.next, null, 'portal transfer must clear pending motion');
          crossings.push({ tick: i, id: worker.id, from: old.layer, to: now.layer });
        }
      }
    }
    orderInvariants(game);
    previous = new Map(game.colony.workers.map(a => [a.id, pos(a)]));
  }
  return crossings;
}
function grow(game, targetWorkers) {
  const q = game.colony.queen;
  while (game.colony.workers.length < targetWorkers) {
    game.lifecycle.promote({ x: q.x, y: q.y });
  }
  assert.equal(new Set(game.colony.workers.map(a => a.id)).size, targetWorkers);
}

test('P1-AI-01 A1 | worker IDs remain unique across deterministic birth/death transitions', () => {
  const game = setup('audit-ids-01');
  grow(game, 16);
  const removed = game.colony.workers[3];
  assert.equal(game.lifecycle.killWorker(removed), true);
  assert.equal(game.lifecycle.killWorker(removed), false);
  grow(game, 16);
  const ids = game.colony.workers.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(removed.id));
  orderInvariants(game);
});

test('P1-AI-01 A2 | concurrent digging never duplicates order ownership', () => {
  const game = setup('audit-dig-02');
  const layer = game.world.layers[UNDERGROUND];
  const targets = [];
  for (let y = 2; y < layer.height - 2 && targets.length < 12; y++) {
    for (let x = 2; x < layer.width - 2 && targets.length < 12; x++) {
      if (!isDiggable(layer, x, y)) continue;
      if (!DIRECTIONS.some(([dx, dy]) => isWalkable(layer, x + dx, y + dy))) continue;
      targets.push({ x, y });
    }
  }
  assert.equal(targets.length, 12);
  for (const target of targets) assert.equal(game.colony.queueRectangle(target, target).added, 1);
  for (let tick = 0; tick < 260; tick++) {
    run(game);
    orderInvariants(game);
  }
  assert.ok(game.colony.completed > 0);
});

test('P1-AI-01 A3 | changing forager slots preserves an already owned dig job', () => {
  const game = setup('audit-forage-dig-03');
  const target = frontier(game, 2);
  assert.equal(game.colony.queueRectangle(target, target).added, 1);
  run(game);
  const job = game.colony.getOrder(target.x, target.y);
  assert.ok(job?.workerId);
  game.colony.setForageSlots(4);
  for (let tick = 0; tick < 350; tick++) {
    run(game);
    orderInvariants(game);
    if (!game.colony.getOrder(target.x, target.y)) break;
  }
  assert.equal(game.colony.getOrder(target.x, target.y), null);
  assert.equal(cellAt(game.world.layers[UNDERGROUND], target.x, target.y), TERRAINS.TUNNEL);
});

test('P1-AI-01 A4 | death frees assigned dig reservation for a living worker', () => {
  const game = setup('audit-death-dig-04');
  const target = frontier(game, 2);
  game.colony.queueRectangle(target, target);
  run(game);
  const job = game.colony.getOrder(target.x, target.y);
  const owner = game.colony.workers.find(a => a.id === job.workerId);
  assert.ok(owner);
  assert.equal(game.lifecycle.killWorker(owner), true);
  assert.equal(job.workerId, null);
  assert.equal(job.status, 'queued');
  for (let i = 0; i < 350; i++) {
    run(game);
    orderInvariants(game);
    if (!game.colony.getOrder(target.x, target.y)) break;
  }
  assert.equal(game.colony.getOrder(target.x, target.y), null);
  assert.equal(game.colony.completed, 1);
});

test('P1-AI-01 A5 | forager reassignment while carrying never drops/duplicates cargo', () => {
  const game = setup('audit-cargo-inflight-05');
  game.colony.setForageSlots(1);
  const carrier = game.colony.workers.at(-1);
  const initial = game.foraging.nodes.reduce((sum, n) => sum + n.initialAmount, 0);
  for (let i = 0; i < 1000 && !carrier.cargo?.amount; i++) run(game);
  assert.ok(carrier.cargo?.amount > 0, 'precondition: a forager must have real gathered cargo');
  const cargoBefore = carrier.cargo.amount;
  game.colony.setForageSlots(0);
  assert.equal(game.combat.setSoldierSlots(4), 4);
  assert.ok(!game.combat.soldiers.includes(carrier), 'busy carrier must not be conscripted');
  assert.ok(carrier.cargo.amount === cargoBefore);
  for (let i = 0; i < 240; i++) {
    run(game);
    if (i % 10 === 0) {
      assert.equal(mass(game), initial, 'resource ledger after reassignment tick ' + i);
      assert.ok(!game.combat.soldiers.includes(carrier));
      orderInvariants(game);
    }
  }
});

test('P1-AI-01 A6 | a new worker changes slot indexing without erasing active trips', () => {
  const game = setup('audit-birth-foragers-06');
  game.colony.setForageSlots(1);
  const active = game.colony.workers.at(-1);
  for (let i = 0; i < 100 && !active.state.startsWith('forage-'); i++) run(game);
  assert.ok(active.state.startsWith('forage-'));
  const reservation = active.resourceId;
  grow(game, 6);
  assert.equal(game.colony.isForager(active), false);
  assert.ok(active.state.startsWith('forage-'), 'ongoing trip must be managed to completion');
  assert.equal(active.resourceId, reservation);
  const ids = game.colony.workers.map(a => a.id);
  assert.equal(ids.length, new Set(ids).size);
  for (let i = 0; i < 45; i++) {
    run(game);
    orderInvariants(game);
  }
});

test('P1-AI-01 B1 | seeded A* uses only cardinal walkable tiles', () => {
  for (const seed of ['ANT-001', 'audit-path-1', 'audit-path-2']) {
    const game = setup(seed);
    const layer = game.world.layers[UNDERGROUND];
    const a = game.colony.workers[0];
    const route = findPath(layer, a, game.colony.queen);
    assert.ok(route?.length > 0);
    let previous = a;
    for (const next of route) {
      assert.equal(distance(previous, next), 1);
      assert.ok(isWalkable(layer, next.x, next.y));
      previous = next;
    }
    assert.deepEqual({ x: previous.x, y: previous.y },
      { x: game.colony.queen.x, y: game.colony.queen.y });
    assert.deepEqual(findPath(layer, a, game.colony.queen), route);
  }
});

test('P1-AI-01 B2 | actual live workers travel cardinally and cross only valid portals', () => {
  const game = setup('audit-movement-08');
  game.colony.setForageSlots(2);
  game.combat.setSoldierSlots(1);
  const target = frontier(game, 2);
  game.colony.queueRectangle(target, target);
  const crossings = auditMovement(game, 520);
  assert.ok(crossings.some(c => c.from === UNDERGROUND && c.to === SURFACE),
    'at least one forager should have used the nest entrance');
});

test('P1-AI-01 B3 | closing an already selected digging step must not put a worker in solid rock', () => {
  const game = setup('audit-midstep-obstruction-09');
  const target = frontier(game, 2);
  game.colony.queueRectangle(target, target);
  run(game);
  const job = game.colony.getOrder(target.x, target.y);
  const worker = game.colony.workers.find(a => a.id === job?.workerId);
  assert.ok(worker?.next, 'precondition: assigned miner must have an in-flight step');
  const blocked = { x: worker.next.x, y: worker.next.y };
  writeCell(game.world.layers[UNDERGROUND], blocked.x, blocked.y, TERRAINS.ROCK);
  run(game, 3);
  assert.ok(isWalkable(game.world.layers[UNDERGROUND], worker.x, worker.y),
    'miner committed a step into newly blocked terrain at ' + JSON.stringify(blocked));
  orderInvariants(game);
});

test('P1-AI-01 B4 | pause freezes ant, combat, job, source and clock states', () => {
  const game = setup('audit-full-pause-10');
  game.colony.setForageSlots(1);
  game.combat.setSoldierSlots(2);
  game.colony.queueRectangle(frontier(game, 2), frontier(game, 2));
  run(game, 30);
  const snapshot = () => JSON.stringify({
    clock: game.clock, workers: game.colony.workers,
    jobs: [...game.colony.orders.values()], nodes: game.foraging.nodes,
    inventory: game.foraging.inventory, soldiers: game.combat.soldierSlots,
    enemies: game.combat.enemies, combatTick: game.combat.tickCount,
    colonyTick: game.colony.tickCount, lifecycleTick: game.lifecycle.tickCount
  });
  const before = snapshot();
  game.setSpeed(0);
  assert.equal(game.update(1000), 0);
  for (let i = 0; i < 100; i++) assert.equal(game.update(100), 0);
  assert.equal(snapshot().replace('"speed":0', '"speed":1'),
    before, 'simulation snapshot should be identical apart from requested speed');
});

test('P1-AI-01 C1 | individual recruit/demobilize respects busy miners and foragers', () => {
  const game = setup('audit-recruit-11');
  game.colony.setForageSlots(1);
  game.colony.queueRectangle(frontier(game, 2), frontier(game, 2));
  run(game);
  const miner = game.colony.workers.find(a => a.orderId != null);
  const forager = game.colony.workers.at(-1);
  assert.ok(miner);
  assert.equal(game.combat.recruit(miner), false);
  assert.equal(game.combat.recruit(forager), false);
  const candidate = game.combat.availableRecruits[0];
  assert.ok(candidate);
  assert.equal(game.combat.recruit(candidate), true);
  assert.equal(game.combat.recruit(candidate), false);
  assert.equal(game.combat.demobilize(candidate), true);
  assert.equal(game.combat.demobilize(candidate), false);
  assert.equal(candidate.state, 'idle');
  orderInvariants(game);
});

test('P1-AI-01 C2 | soldier target transitions 0, 1, 2, 13, 14 never manufacture ants', () => {
  for (const count of [0, 1, 2, 13, 14]) {
    const game = setup('audit-soldier-target-' + count);
    grow(game, 15);
    const ids = game.colony.workers.map(a => a.id);
    assert.equal(game.combat.setSoldierSlots(count), count);
    assert.equal(game.combat.soldiers.length, count);
    assert.deepEqual(game.colony.workers.map(a => a.id), ids);
    assert.equal(new Set(game.combat.soldiers.map(a => a.id)).size, count);
    assert.ok(game.combat.soldiers.every(a => a.orderId == null && !a.state.startsWith('forage-')));
    assert.equal(game.combat.setSoldierSlots(0), 0);
    assert.equal(game.combat.soldiers.length, 0);
    assert.deepEqual(game.colony.workers.map(a => a.id), ids);
  }
});

test('P1-AI-01 C3 | 13 defenders get distinct reachable formation goals', () => {
  const game = setup('audit-formation-13');
  grow(game, 15);
  assert.equal(game.combat.setSoldierSlots(13), 13);
  const queen = game.colony.queen;
  assert.equal(game.combat.setRally(UNDERGROUND, queen.x, queen.y), true);
  const goals = game.combat.soldiers.map(a => game.combat.getRallyGoal(a));
  assert.equal(new Set(goals.map(g => g.layer + ':' + g.x + ',' + g.y)).size, 13);
  assert.ok(goals.every(g => isWalkable(game.world.layers[g.layer], g.x, g.y)));
});

test('P1-AI-01 C4 | 14 defenders must not be assigned the same formation tile', () => {
  const game = setup('audit-formation-14');
  grow(game, 15);
  assert.equal(game.combat.setSoldierSlots(14), 14);
  const queen = game.colony.queen;
  assert.equal(game.combat.setRally(UNDERGROUND, queen.x, queen.y), true);
  const goals = game.combat.soldiers.map(a => game.combat.getRallyGoal(a));
  const distinct = new Set(goals.map(g => g.layer + ':' + g.x + ',' + g.y));
  assert.equal(distinct.size, 14, '14th soldier collides with another formation goal; design review required');
});

test('P1-AI-01 C5 | surface rally uses the real portal and remains cardinal', () => {
  const game = setup('audit-surface-rally-15');
  game.combat.setSoldierSlots(2);
  const entry = game.world.entrances[0].surface;
  assert.equal(game.combat.setRally(SURFACE, entry.x + 3, entry.y), true);
  const crossings = auditMovement(game, 160);
  assert.ok(crossings.some(c => c.from === UNDERGROUND && c.to === SURFACE));
  assert.ok(game.combat.soldiers.every(a => a.layer === SURFACE));
});

test('P1-AI-01 C6 | changing underground rally while en route does not teleport troops', () => {
  const game = setup('audit-rally-change-16');
  game.combat.setSoldierSlots(2);
  const q = game.colony.queen;
  assert.equal(game.combat.setRally(UNDERGROUND, q.x + 3, q.y), true);
  auditMovement(game, 9);
  assert.equal(game.combat.setRally(UNDERGROUND, q.x - 3, q.y), true);
  auditMovement(game, 100);
  assert.equal(game.combat.ralliedCount, 2);
});

test('P1-AI-01 C7 | disconnected rally fails and preserves valid previous selection', () => {
  const game = setup('audit-disconnected-17');
  const q = game.colony.queen;
  assert.equal(game.combat.setRally(UNDERGROUND, q.x + 1, q.y), true);
  const previous = { ...game.combat.rally };
  const layer = game.world.layers[UNDERGROUND];
  writeCell(layer, 1, 1, TERRAINS.TUNNEL);
  assert.ok(isWalkable(layer, 1, 1));
  assert.equal(game.combat.setRally(UNDERGROUND, 1, 1), false);
  assert.deepEqual(game.combat.rally, previous);
});

test('P1-AI-01 C8 | surface retreat is physical; injury survives demobilization', () => {
  const game = setup('audit-retreat-18');
  game.combat.setSoldierSlots(1);
  const soldier = game.combat.soldiers[0];
  const entry = game.world.entrances[0].surface;
  assert.equal(game.combat.setRally(SURFACE, entry.x + 3, entry.y), true);
  auditMovement(game, 110);
  assert.equal(soldier.layer, SURFACE);
  soldier.combatHP = 5;
  game.combat.setMode('retreat');
  auditMovement(game, 110);
  assert.equal(soldier.layer, UNDERGROUND);
  assert.ok(soldier.combatHP >= 5 && soldier.combatHP <= COMBAT.soldierHP);
  const health = soldier.combatHP;
  assert.equal(game.combat.demobilize(soldier), true);
  assert.equal(soldier.combatHP, health);
  assert.equal(game.combat.recruit(soldier), true);
  assert.equal(soldier.combatHP, health);
});

test('P1-AI-01 meta | explicit audited baseline identifier is recorded', () => {
  assert.equal(BASELINE, 'd508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237');
});
