import { createClock, FixedStepper } from './time.js';
import { snapshotPositions } from './render-motion.js';
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
