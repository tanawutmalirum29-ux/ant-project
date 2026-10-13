import { createClock, FixedStepper, TICK_MS } from './time.js';
import { createWorld, SURFACE, UNDERGROUND } from '../world/generate.js';
import { Colony } from './colony.js';
import { Foraging } from './foraging.js';
import { Lifecycle } from './lifecycle.js';
import { Rooms } from './rooms.js';
import { Combat } from './combat.js';
import { createResourceNodes } from '../world/resources.js';
/** Worker assignment policy: editable shares plus a protected general-work remainder.
 * Only real workers count (not queen or brood). All integer quotas sum to N via
 * deterministic largest-remainder apportionment, stable on birth/death. */
export class WorkforcePolicy {
  constructor(game) {
    this.game=game;
    this.shares={forage:40,nurse:20,soldier:20};
    this.manual=new Set();
    this.dirty=true;
    this.lastPopulation=-1;
    this.reconcile();
  }
  get generalPercent(){return 100-this.shares.forage-this.shares.nurse-this.shares.soldier;}
  setShare(kind,percent) {
    if(!['forage','nurse','soldier'].includes(kind)||
       !Number.isInteger(percent)||percent<0||percent>100)
      throw new RangeError('Invalid workforce percentage');
    const limit=100-Object.entries(this.shares).reduce((n,[key,value])=>n+(key===kind?0:value),0);
    if(percent>limit)throw new RangeError('Workforce percentages exceed 100');
    this.shares[kind]=percent;
    this.manual.clear(); // UI takes control of all three workforce targets again.
    this.dirty=true;
    this.reconcile();
    return this.shares[kind];
  }
  disableAuto(kind){
    if(['forage','nurse','soldier'].includes(kind))this.manual.add(kind);
  }
  plan(population=this.game.colony.workers.length){
    const n=population,weights={...this.shares,general:this.generalPercent};
    const keys=['forage','nurse','soldier','general'];
    const counts={},remainders=[];
    let assigned=0;
    for(const key of keys) {
      const numerator=n*weights[key];
      counts[key]=Math.floor(numerator/100);
      assigned+=counts[key];
      remainders.push({key,remainder:numerator%100,index:keys.indexOf(key)});
    }
    remainders.sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
    for(let i=0;i<n-assigned;i++)counts[remainders[i].key]++;
    return counts;
  }
  reconcile() {
    const n=this.game.colony.workers.length;
    if(!this.dirty && n===this.lastPopulation)return;
    const targets=this.plan(n);
    const {colony,lifecycle,combat}=this.game;
    // Existing in-progress digging, resource trips, carried brood and construction
    // are not cancelled by quotas. The original schedulers decide safe turnover.
    if(!this.manual.has('forage')&&colony.forageSlots!==targets.forage)
      colony.setForageSlots(targets.forage,true);
    if(!this.manual.has('nurse')&&lifecycle.nurseSlots!==targets.nurse)
      lifecycle.setNurseSlots(targets.nurse,true);
    if(!this.manual.has('soldier')&&combat.soldierSlots!==targets.soldier)
      combat.setSoldierSlots(targets.soldier,true);
    this.lastPopulation=n;this.dirty=false;
  }
}
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
    this.workforce = new WorkforcePolicy(this);
    this.colony.workforce=this.workforce;
    this.lifecycle.workforce=this.workforce;
    this.combat.workforce=this.workforce;
    this.renderMotion = null;
    this.systems = [(game) => game.workforce.reconcile(), (game) => game.colony.tick(), (game) => game.foraging.tick(), (game) => game.rooms.tick(), (game) => game.lifecycle.tick(), (game) => game.workforce.reconcile(), (game) => game.combat.tick(), (game) => game.colony.tickAmbient(game.combat)];
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
