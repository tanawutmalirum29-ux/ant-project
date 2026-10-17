import { createClock, FixedStepper, TICK_MS, formatGameTime } from './time.js';
import { createWorld, SURFACE, UNDERGROUND } from '../world/generate.js';
import { Colony } from './colony.js';
import { Foraging } from './foraging.js';
import { Lifecycle, LIFE } from './lifecycle.js';
import { Rooms } from './rooms.js';
import { Combat } from './combat.js';
import { createResourceNodes } from '../world/resources.js';
import { ResourceEcology } from './resource-ecology.js';
import { Weather } from './weather.js';
import { MilestoneTracker } from './milestones.js';
/** Compatibility adapter: percentage settings are no longer profession quotas.
 * Actual jobs and troop headcounts derive only from permanent ant professions. */
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
    const {colony,lifecycle,combat}=this.game;
    const n=colony.workers.length;
    const starters=colony.workers.filter(a=>a.profession==='starter'||!a.profession);
    const nurses=colony.workers.filter(a=>a.profession==='nurse').length;
    // No fixed specialist is ever reassigned, and no quota drafts soldiers.
    // Recheck every tick: the caste mix can change without population changing.
    if(!this.manual.has('nurse'))
      lifecycle.nurseSlots=Math.min(n,nurses||(starters.length?1:colony.emergencyWorker('nurse')?1:0));
    if(!this.manual.has('forage'))colony.forageSlots=Math.min(starters.length,2);
    combat.soldierSlots=combat.soldiers.length;
    this.lastPopulation=n;this.dirty=false;
  }
}
export class Game {
  constructor(seed = 'ANT-001') {
    this.world = createWorld(seed);
    this.layer = UNDERGROUND;
    this.clock = createClock();
    this.world.resources = createResourceNodes(this.world);
    // Weather is an independent, seeded clock; ecology consumes its current
    // multipliers on the exact same simulation step, not wall-clock time.
    this.weather = new Weather(this.world);
    // The live source array is shared by foragers, renderer and ecology.
    this.ecology = new ResourceEcology(this.world, this.weather);
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
    // Immutable terminal outcome: never inferred independently by a UI skin.
    this.defeat = null;
    this.milestones = new MilestoneTracker(this);
    this.systems = [(game) => game.workforce.reconcile(), (game) => game.colony.tick(), (game) => game.foraging.tick(), (game) => game.weather.tick(), (game) => game.ecology.tick(), (game) => game.rooms.tick(), (game) => game.lifecycle.tick(), (game) => game.workforce.reconcile(), (game) => game.combat.tick(), (game) => game.colony.tickAmbient(game.combat), (game) => game.milestones.observe()];
    this.stepper = new FixedStepper(() => {
      const before = snapshotPositions(this);
      for (const system of this.systems) {
        system(this);
        if (this.colony.queen?.alive === false) {
          // Stop within THIS fixed tick, before any other game system can
          // mutate the colony after its terminal state.
          this.recordDefeat(this.clock.ticks + 1);
          break;
        }
      }
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
  // Subscriber callbacks precede the milestone observer, which must remain last.
  onTick(system) { this.systems.splice(this.systems.length - 1, 0, system); }
  /** The only authoritative terminal transition, shared by both UI skins. */
  recordDefeat(tick=this.clock.ticks) {
    if (this.defeat || this.colony.queen?.alive !== false) return this.defeat;
    const health=this.lifecycle.queenHealth;
    const cause=this.combat.queenHP<=0?'combat':
      health?.age>=LIFE.queenMaxAge?'age':
      health?.hunger>LIFE.queenStarve?'starvation':
      health?.thirst>LIFE.queenStarve+600?'dehydration':'unknown';
    const causes={
      combat:'นางพญาถูกศัตรูโจมตีจนสิ้นชีวิต',
      age:'นางพญาสิ้นอายุขัย',
      starvation:'นางพญาขาดอาหาร',
      dehydration:'นางพญาขาดน้ำ',
      unknown:'นางพญาสิ้นชีวิต'
    };
    this.defeat=Object.freeze({
      cause,reason:causes[cause],tick,seed:this.world.seedLabel,
      population:this.population,workers:this.colony.workers.length,
      births:this.lifecycle.births,
      casualties:this.combat.casualties,
      defeatedEnemies:this.combat.defeated
    });
    this.stepper.changeSpeed(0);
    return this.defeat;
  }
  update(ms) {
    if (this.defeat || this.colony.queen?.alive === false) {
      this.recordDefeat();
      return 0;
    }
    return this.stepper.update(ms);
  }
  setSpeed(value) { this.stepper.changeSpeed(this.defeat ? 0 : value); }
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
