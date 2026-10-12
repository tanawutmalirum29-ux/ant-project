import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, SURFACE, UNDERGROUND, TERRAINS, cellAt, portalAt } from '../src/world/generate.js';
import { createClock, getGameTime, FixedStepper, setSpeed, TICKS_PER_SECOND } from '../src/core/time.js';
import { normalizeSeed, createRandom, tileHash } from '../src/core/random.js';
import { Camera, MIN_ZOOM, MAX_ZOOM } from '../src/render/camera.js';
import { Game } from '../src/core/game.js';

const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('U1.1 world dimensions, cell types and portal link', () => {
  const w = createWorld('TEST-001');
  assert.equal(w.layers[SURFACE].cells.length, 128 * 128);
  assert.equal(w.layers[UNDERGROUND].cells.length, 96 * 64);
  const e = w.entrances[0];
  assert.equal(e.id, 'nest-main');
  for (const layer of [SURFACE, UNDERGROUND]) {
    assert.equal(cellAt(w.layers[layer], e[layer].x, e[layer].y), TERRAINS.ENTRANCE);
    assert.equal(portalAt(w, layer, e[layer].x, e[layer].y)?.id, e.id);
  }
  assert.equal(cellAt(w.layers[SURFACE], -1, 0), null);
  assert.equal(cellAt(w.layers[UNDERGROUND], 96, 20), null);
});

test('U1.2 deterministic seeded generation and different world seeds', () => {
  const a = createWorld('ANT-ABC'), b = createWorld('ANT-ABC'), c = createWorld('OTHER');
  for (const kind of [SURFACE, UNDERGROUND]) {
    assert.deepEqual(a.layers[kind].cells, b.layers[kind].cells);
    assert.notDeepEqual(a.layers[kind].cells, c.layers[kind].cells);
  }
  assert.equal(normalizeSeed('same'), normalizeSeed('same'));
  assert.equal(tileHash(42, 10, 9), tileHash(42, 10, 9));
  const ra = createRandom(12), rb = createRandom(12);
  for (let i = 0; i < 25; i++) assert.equal(ra.next(), rb.next());
});

test('U1.3 fixed 10 TPS, 8-minute game day, pause and speed', () => {
  const clock = createClock();
  let calls = 0;
  const runner = new FixedStepper(() => calls++, clock);
  for (let i = 0; i < 100; i++) runner.update(100);
  assert.equal(TICKS_PER_SECOND, 10);
  assert.equal(calls, 100);
  assert.equal(clock.ticks, 100);
  assert.equal(getGameTime(clock).hours, 6);
  assert.equal(getGameTime(clock).minutes, 30);
  runner.changeSpeed(0);
  runner.update(200);
  assert.equal(calls, 100);
  runner.changeSpeed(2);
  runner.update(100);
  assert.equal(calls, 102);
  runner.changeSpeed(4);
  runner.update(100);
  assert.equal(calls, 106);
  assert.throws(() => setSpeed(clock, -1), RangeError);
  const dayClock = createClock();
  dayClock.ticks = 4800;
  assert.deepEqual([getGameTime(dayClock).day, getGameTime(dayClock).hours, getGameTime(dayClock).minutes], [2, 6, 0]);
});

test('U1.4 camera coordinate transforms, zoom anchors and clamps', () => {
  const layer = createWorld().layers[UNDERGROUND];
  const cam = new Camera(UNDERGROUND, { x: 48, y: 15 });
  const screen = cam.worldToScreen(400, 800, 420, 780);
  const back = cam.screenToWorld(screen.x, screen.y, 420, 780);
  near(back.x, 400); near(back.y, 800);
  const spot = { x: 240, y: 170 };
  const before = cam.screenToWorld(spot.x, spot.y, 420, 780);
  cam.zoomAt(1.35, spot.x, spot.y, layer, 420, 780);
  const after = cam.screenToWorld(spot.x, spot.y, 420, 780);
  near(before.x, after.x); near(before.y, after.y);
  cam.pan(20, -10, layer, 420, 780);
  const position = cam.screenToCell(210, 390, 420, 780);
  assert.equal(position.x, Math.floor(cam.x / 28));
  for (let i = 0; i < 20; i++) cam.zoomAt(20, 210, 390, layer, 420, 780);
  assert.equal(cam.zoom, MAX_ZOOM);
  for (let i = 0; i < 20; i++) cam.zoomAt(0.05, 210, 390, layer, 420, 780);
  assert.equal(cam.zoom, MIN_ZOOM);
  cam.pan(1e6, -1e6, layer, 420, 780);
  assert.ok(cam.x >= 0 && cam.x <= layer.width * 28);
  assert.ok(cam.y >= 0 && cam.y <= layer.height * 28);
});

test('U1.5 switching layers preserves clock, world and system state', () => {
  const game = new Game('stable');
  let simulated = 0;
  game.onTick(() => simulated++);
  for (let i = 0; i < 30; i++) game.update(100);
  const initial = game.clock.ticks;
  const surface = game.world.layers[SURFACE];
  game.toggleLayer();
  for (let i = 0; i < 20; i++) game.update(100);
  game.toggleLayer();
  assert.equal(game.clock.ticks, initial + 20);
  assert.equal(simulated, 50);
  assert.strictEqual(game.world.layers[SURFACE], surface);
  assert.equal(game.population, 0);
});
