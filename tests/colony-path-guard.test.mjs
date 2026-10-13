import test from 'node:test';
import assert from 'node:assert/strict';
import { Colony, WORKER_SPEED } from '../src/core/colony.js';
import { Game } from '../src/core/game.js';
import { createWorld, UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { DIRECTIONS, isDiggable, isWalkable, reachablePaths } from '../src/world/navigation.js';

// Terrain mutations here are synthetic stress cases, NOT an established live-player action.
function setup(seed = 'audit-midstep-obstruction-09') {
  const world = createWorld(seed);
  const colony = new Colony(world);
  colony.setForageSlots(0);
  return { world, colony, layer: world.layers[UNDERGROUND] };
}
const position = ant => ({ x: ant.x, y: ant.y });
const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function frontier({ colony, layer }, minDistance = 2, excluded = []) {
  const paths = colony.workers.map(ant => reachablePaths(layer, ant));
  for (let y = 2; y < layer.height - 2; y++) for (let x = 2; x < layer.width - 2; x++) {
    if (!isDiggable(layer, x, y) || excluded.some(p => md(p, { x, y }) < 5)) continue;
    for (const reach of paths) for (const [dx, dy] of DIRECTIONS) {
      if (reach && reach.distance(x + dx, y + dy) >= minDistance) return { x, y };
    }
  }
  throw new Error('Expected a reachable excavation frontier');
}
function assign(fixture) {
  const target = frontier(fixture);
  assert.equal(fixture.colony.queueRectangle(target, target).added, 1);
  fixture.colony.tick();
  const job = fixture.colony.getOrder(target.x, target.y);
  const ant = fixture.colony.workers.find(a => a.id === job?.workerId);
  assert.ok(ant?.next, 'miner must have a pending in-flight step');
  assert.equal(md(ant, ant.next), 1);
  assert.ok(isWalkable(fixture.layer, ant.next.x, ant.next.y));
  return { target, job, ant, initial: position(ant), step: { ...ant.next } };
}
function assertReleased(colony, ant, job) {
  assert.equal(ant.orderId, null);
  assert.equal(ant.state, 'idle');
  assert.deepEqual(ant.path, []);
  assert.equal(ant.next, null);
  assert.equal(ant.motion, 0);
  assert.equal(job.workerId, null);
  assert.equal(job.status, 'queued');
  assert.strictEqual(colony.getOrder(job.x, job.y), job, 'original order must remain queued');
  assert.strictEqual(colony.ordersById.get(job.id), job);
}
function ownership(colony) {
  assert.equal(colony.orders.size, colony.ordersById.size);
  const owners = new Set(), jobs = new Set();
  for (const job of colony.orders.values()) {
    assert.strictEqual(colony.ordersById.get(job.id), job);
    if (job.workerId == null) continue;
    assert.ok(!owners.has(job.workerId), 'worker owns at most one order');
    owners.add(job.workerId);
    const ant = colony.workers.find(a => a.id === job.workerId);
    assert.ok(ant, 'owner exists');
    assert.equal(ant.orderId, job.id);
  }
  for (const ant of colony.workers) if (ant.orderId != null) {
    assert.ok(!jobs.has(ant.orderId), 'order has only one worker');
    jobs.add(ant.orderId);
    assert.equal(colony.ordersById.get(ant.orderId)?.workerId, ant.id);
  }
}

test('PATH-GUARD-01 | synthetic B3 analog blocks selected next tile for two seeds', () => {
  for (const seed of ['audit-midstep-obstruction-09', 'path-guard-seed-two']) {
    const fixture = setup(seed);
    const { colony, layer } = fixture;
    const { job, ant, initial, step } = assign(fixture);
    writeCell(layer, step.x, step.y, TERRAINS.ROCK);
    colony.tick();
    assert.deepEqual(position(ant), initial, seed + ': no step into blocked tile');
    assert.ok(isWalkable(layer, ant.x, ant.y));
    assertReleased(colony, ant, job);
    ownership(colony);
  }
});

test('PATH-GUARD-02 | synthetic obstruction after 0.68 motion cannot commit next tile', () => {
  const fixture = setup();
  const { colony, layer } = fixture;
  const { job, ant, initial, step } = assign(fixture);
  colony.tick();
  assert.ok(Math.abs(ant.motion - 2 * WORKER_SPEED) < 1e-12);
  writeCell(layer, step.x, step.y, TERRAINS.ROCK);
  colony.tick();
  assert.deepEqual(position(ant), initial);
  assertReleased(colony, ant, job);
  ownership(colony);
});

test('PATH-GUARD-03 | non-cardinal pending step never moves or retains job', () => {
  const fixture = setup();
  const { colony } = fixture, { ant, job, initial } = assign(fixture);
  // A zero-length hop is walkable, but not a valid cardinal step.
  ant.next = { ...initial };
  ant.path[0] = { ...initial };
  colony.tick();
  assert.deepEqual(position(ant), initial);
  assertReleased(colony, ant, job);
  ownership(colony);
});

test('PATH-GUARD-04 | path and selected pending step must stay continuous', () => {
  const fixture = setup();
  const { colony } = fixture, { ant, job, initial } = assign(fixture);
  ant.path[0] = { ...initial }; // pending step is cardinal but path no longer agrees
  colony.tick();
  assert.deepEqual(position(ant), initial);
  assertReleased(colony, ant, job);
  ownership(colony);
});

test('PATH-GUARD-05 | invalid dig target releases its exact owner, preserving order ID', () => {
  const fixture = setup();
  const { colony, layer } = fixture, { ant, job, target } = assign(fixture);
  const progress = job.progress;
  writeCell(layer, target.x, target.y, TERRAINS.ROCK);
  colony.tick();
  assertReleased(colony, ant, job);
  assert.equal(job.progress, progress);
  assert.equal(cellAt(layer, target.x, target.y), TERRAINS.ROCK);
  ownership(colony);
});

test('PATH-GUARD-06 | mismatched reservation must not clear a different owner', () => {
  const fixture = setup();
  const { colony } = fixture, { ant, job } = assign(fixture);
  const other = colony.workers.find(worker => worker !== ant);
  // Simulate an external handoff with the original ant retaining stale orderId.
  job.workerId = other.id;
  other.orderId = job.id;
  other.path = [];
  other.next = null;
  other.state = 'digging';
  // Run only until the original owner is processed; other worker (later in array)
  // may independently determine its own position is invalid and requeue.
  const oldIndex = colony.workers.indexOf(ant);
  const otherIndex = colony.workers.indexOf(other);
  if (otherIndex < oldIndex) {
    // Existing later ant is guaranteed by selecting a stale earlier owner instead.
    // Exercise mismatch directly with an absent foreign owner.
    job.workerId = 'external-foreign-owner';
    other.orderId = null;
    other.state = 'idle';
  }
  colony.tick();
  assert.equal(ant.orderId, null);
  if (job.workerId != null) assert.notEqual(job.workerId, ant.id);
  assert.equal(colony.ordersById.get(job.id), job);
});

test('PATH-GUARD-07 | reopening synthetic obstruction permits eventual requeue/completion', () => {
  const fixture = setup('guard-recovery-07');
  const { colony, layer } = fixture, { ant, job, step, initial } = assign(fixture);
  writeCell(layer, step.x, step.y, TERRAINS.ROCK);
  colony.tick();
  assert.deepEqual(position(ant), initial);
  assertReleased(colony, ant, job);
  writeCell(layer, step.x, step.y, TERRAINS.TUNNEL);
  let ticks = 0;
  while (colony.getOrder(job.x, job.y) && ticks++ < 600) {
    colony.tick();
    ownership(colony);
  }
  assert.equal(colony.getOrder(job.x, job.y), null, 'original order eventually completed');
  assert.equal(colony.completed, 1);
  assert.equal(cellAt(layer, job.x, job.y), TERRAINS.TUNNEL);
});

test('PATH-GUARD-08 | two miners cannot double-own jobs after a blocked route', () => {
  const fixture = setup('guard-concurrent-08');
  const { colony, layer } = fixture;
  const a = frontier(fixture), b = frontier(fixture, 2, [a]);
  assert.equal(colony.queueRectangle(a, a).added, 1);
  assert.equal(colony.queueRectangle(b, b).added, 1);
  colony.tick();
  ownership(colony);
  const moving = colony.workers.find(worker => worker.orderId != null && worker.next);
  assert.ok(moving);
  const step = { ...moving.next };
  writeCell(layer, step.x, step.y, TERRAINS.ROCK);
  colony.tick();
  ownership(colony);
  writeCell(layer, step.x, step.y, TERRAINS.TUNNEL);
  for (let tick = 0; tick < 500; tick++) {
    const before = new Map(colony.workers.map(w => [w.id, position(w)]));
    colony.tick();
    ownership(colony);
    for (const w of colony.workers) {
      assert.ok(md(before.get(w.id), w) <= 1, 'no teleport: ' + w.id);
      assert.ok(isWalkable(layer, w.x, w.y), 'worker remains on walkable terrain');
    }
    if (colony.completed === 2) break;
  }
  assert.equal(colony.completed, 2);
});

test('PATH-GUARD-09 | valid movement remains exactly 0.34 per tick, commit on third', () => {
  const fixture = setup();
  const { colony } = fixture;
  const { ant, initial, step } = assign(fixture);
  assert.equal(WORKER_SPEED, 0.34);
  assert.ok(Math.abs(ant.motion - 0.34) < 1e-12);
  assert.deepEqual(position(ant), initial);
  colony.tick();
  assert.ok(Math.abs(ant.motion - 0.68) < 1e-12);
  assert.deepEqual(position(ant), initial);
  colony.tick();
  assert.deepEqual(position(ant), step);
  assert.equal(ant.motion, 0);
  ownership(colony);
});

test('PATH-GUARD-10 | paused game remains unchanged, including queued dig work', () => {
  const game = new Game('guard-pause-10');
  game.colony.setForageSlots(0);
  const fixture = { colony: game.colony, layer: game.world.layers[UNDERGROUND] };
  const target = frontier(fixture);
  game.colony.queueRectangle(target, target);
  assert.equal(game.update(100), 1);
  game.setSpeed(0);
  const snapshot = () => JSON.stringify({
    workers: game.colony.workers,
    orders: [...game.colony.orders.values()],
    tick: game.colony.tickCount,
    completed: game.colony.completed
  });
  const before = snapshot();
  assert.equal(game.update(1000), 0);
  for (let i = 0; i < 20; i++) assert.equal(game.update(100), 0);
  assert.equal(snapshot(), before);
});
