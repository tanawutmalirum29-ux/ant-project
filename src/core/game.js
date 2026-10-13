import { createClock, FixedStepper, TICK_MS } from './time.js';
import { createWorld, SURFACE, UNDERGROUND } from '../world/generate.js';
import { Colony } from './colony.js';
import { Foraging } from './foraging.js';
import { Lifecycle } from './lifecycle.js';
import { Rooms } from './rooms.js';
import { Combat } from './combat.js';
import { createResourceNodes } from '../world/resources.js';
export class Game {
  constructor(seed = 'ANT-001') {
    this.world = createWorld(seed);
    this.layer = UNDERGROUND;
    this.clock = createClock();
    this.world.resources = createResourceNodes(this.world);
    this.colony = new Colony(this.world);
    this.foraging = new Foraging(this.world,this.colony);
    this.lifecycle = new Lifecycle(this.colony,this.foraging);
    this.rooms = new Rooms(this.world,this.colony,this.foraging);
    this.foraging.rooms = this.rooms;
    this.lifecycle.rooms = this.rooms;
    this.rooms.lifecycle = this.lifecycle;
    this.combat = new Combat(this.world,this.colony,this.foraging,this.lifecycle,this.rooms);
    this.renderMotion = null;
    this.systems = [(game) => game.colony.tick(), (game) => game.foraging.tick(), (game) => game.rooms.tick(), (game) => game.lifecycle.tick(), (game) => game.combat.tick()];
    this.stepper = new FixedStepper(() => {
      const before = snapshotPositions(this);
      for (const system of this.systems) system(this);
      this.renderMotion = { from: before, to: snapshotPositions(this) };
      this.metrics.pendingTasks = this.colony.pendingCount;
    }, this.clock);
    this.metrics = { fps: 0, tps: 0, simMs: 0, renderMs: 0, pendingTasks: 0 };

  }
  get population() { return this.colony.population; }
  get currentLayer() { return this.world.layers[this.layer]; }
  toggleLayer() { this.layer = this.layer === UNDERGROUND ? SURFACE : UNDERGROUND; return this.layer; }
  setLayer(layer) {
    if (layer !== SURFACE && layer !== UNDERGROUND) throw new RangeError('Unknown layer');
    this.layer = layer;
  }
  onTick(system) { this.systems.push(system); }
  update(ms) { return this.stepper.update(ms); }
  setSpeed(value) { this.stepper.changeSpeed(value); }
}

/**
 * Presentation-only tile coordinates. The simulation still owns every move,
 * collision, path and portal transition; these samples never mutate units.
 */
export function unitPose(unit) {
  const progress = unit.next ? Math.max(0, Math.min(1, unit.motion ?? 0)) : 0;
  return {
    layer: unit.layer,
    x: unit.x + (unit.next ? (unit.next.x - unit.x) * progress : 0),
    y: unit.y + (unit.next ? (unit.next.y - unit.y) * progress : 0)
  };
}

export function snapshotPositions(game) {
  const positions = new Map();
  if (game.colony.queen) positions.set(game.colony.queen, unitPose(game.colony.queen));
  for (const ant of game.colony.workers) positions.set(ant, unitPose(ant));
  for (const enemy of game.combat.enemies) positions.set(enemy, unitPose(enemy));
  return positions;
}

/** Draw one completed simulation step over the following fixed-step interval. */
export function displayedPosition(game, unit) {
  const actual = unitPose(unit);
  const previous = game.renderMotion?.from.get(unit);
  const latest = game.renderMotion?.to.get(unit);
  // Spawn, portal crossing and out-of-band commands must never draw ghost motion
  // through walls or across layers.
  if (!previous || !latest || previous.layer !== latest.layer ||
      latest.layer !== actual.layer || actual.x !== latest.x || actual.y !== latest.y) return actual;

  const alpha = game.clock.speed === 0 ? 1 :
    Math.max(0, Math.min(1, game.stepper.accumulator / TICK_MS));
  return {
    layer: actual.layer,
    x: previous.x + (latest.x - previous.x) * alpha,
    y: previous.y + (latest.y - previous.y) * alpha
  };
}
