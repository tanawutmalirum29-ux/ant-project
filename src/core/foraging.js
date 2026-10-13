import { SURFACE, UNDERGROUND } from '../world/generate.js';
import { findPath, isWalkable } from '../world/navigation.js';
import { WORKER_SPEED } from './colony.js';
import { RESOURCE_TYPES } from '../world/resources.js';

export const CARRY_CAPACITY = 3;
export const GATHER_TICKS = 5;
const at = (a,b) => a.x === b.x && a.y === b.y;

/** Autonomous resource trips. Every unit is tracked as a source, reservation, cargo, or deposited stock. */
export class Foraging {
  constructor(world, colony) {
    this.world = world;
    this.colony = colony;
    this.nodes = world.resources;
    this.inventory = { carbs:0, protein:0, water:0 };
    this.delivered = 0;
    this.completedTrips = 0;
    this.tickCount = 0;
    this.rooms = null; // Set by Game after creating the U5 room system.
  }
  capacityFor(type) { return this.rooms ? this.rooms.capacityFor(type) : 9999; }
  get waitingCount() { return this.colony.workers.filter(a => a.state==='forage-wait-storage').length; }
  get activeCount() { return this.colony.workers.filter(a => a.state.startsWith('forage-')).length; }
  get remaining() { return this.nodes.reduce((sum,node) => sum+node.amount,0); }
  getNode(x,y) { return this.nodes.find(n => n.x===x && n.y===y) || null; }
  releaseReservation(ant) {
    if (ant.resourceId) {
      const node=this.nodes.find(n=>n.id===ant.resourceId);
      if (node) node.reserved = Math.max(0,node.reserved-(ant.reservedAmount||0));
    }
    ant.resourceId=null;
    ant.reservedAmount=0;
  }
  /** A route failure must not teleport an ant, drop units, or duplicate stock. */
  walk(ant, layer, goal) {
    if (!isWalkable(layer,ant.x,ant.y) || !isWalkable(layer,goal.x,goal.y)) return false;
    if (!ant.next && ant.path.length===0 && !at(ant,goal)) {
      const path=findPath(layer,ant,goal);
      if (!path) return false;
      ant.path=path;
    }
    if(ant.next && (!isWalkable(layer,ant.next.x,ant.next.y)||Math.abs(ant.next.x-ant.x)+Math.abs(ant.next.y-ant.y)!==1)) {
      ant.next=null;ant.path=[];ant.motion=0;return false;
    }
    if (!ant.next && ant.path.length) {
      const step=ant.path[0];
      if (!isWalkable(layer,step.x,step.y) || Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1) {
        ant.path=[];return false;
      }
      ant.next=step;ant.motion=0;
      ant.facing=step.x>ant.x?1:step.x<ant.x?3:step.y>ant.y?2:0;
    }
    if (ant.next) {
      ant.motion += WORKER_SPEED;
      if (ant.motion >= 1) {
        ant.x=ant.next.x;ant.y=ant.next.y;ant.next=null;ant.motion=0;ant.path.shift();
      }
    }
    return !ant.next && ant.path.length===0 && at(ant,goal);
  }
  setPhase(ant, phase) {
    ant.state=`forage-${phase}`;ant.path=[];ant.next=null;ant.motion=0;
  }
  pickNode(ant) {
    this.rooms?.syncInventory();
    const available = this.nodes.filter(n=>n.amount-n.reserved>0 && (this.rooms ? this.rooms.storageSlots(n.type).some(v=>v.space>0) : this.inventory[n.type] < this.capacityFor(n.type)));
    if(!available.length) return null;
    // Diversify nutrients without a global expensive full-map search every tick.
    const totals = Object.fromEntries(RESOURCE_TYPES.map(type => [type, this.inventory[type] + this.colony.workers.reduce((n,w)=>n+(w.cargo?.type===type?w.cargo.amount:0),0)]));
    available.sort((a,b)=>(totals[a.type]-totals[b.type]) || (a.distance-b.distance) || a.id.localeCompare(b.id));
    return available[0];
  }
  beginTrip(ant) {
    if(ant.orderId!=null || ant.state!=='idle' || !this.colony.isForager(ant)) return;
    const node=this.pickNode(ant);
    if(!node) return;
    const reservation=Math.min(CARRY_CAPACITY,node.amount-node.reserved);
    if(reservation<=0)return;
    const from=this.world.layers[UNDERGROUND], entry=this.world.entrances[0].underground;
    if(!findPath(from,ant,entry))return;
    node.reserved+=reservation;
    ant.resourceId=node.id;ant.reservedAmount=reservation;ant.cargo=null;
    this.setPhase(ant,'to-portal');
  }
  failTrip(ant) {
    // On exceptional obstruction, keep carried units and return home if possible.
    this.releaseReservation(ant);
    if (ant.cargo?.amount) {
      this.setPhase(ant,ant.layer===SURFACE?'return-surface':'return-underground');
    } else if (ant.layer===SURFACE) this.setPhase(ant,'return-empty');
    else this.resetAnt(ant);
  }
  // Deliver ONLY while the ant stands inside a reachable completed warehouse.
  // If that storage fills, reroute with cargo to another real destination.
  deliverCargo(ant, underground, fallback) {
    if(!ant.cargo?.amount){this.resetAnt(ant);return;}
    const type=ant.cargo.type;
    const target=this.rooms?.deliveryTarget(type,ant);
    if(!target) {ant.state='forage-wait-storage';ant.path=[];ant.next=null;ant.motion=0;return;}
    if(!this.walk(ant,underground,target.site.tile)) {
      ant.state='forage-wait-storage';return;
    }
    const amount=this.rooms ? this.rooms.depositAt(ant,type,ant.cargo.amount,target.room.id)
      : Math.min(ant.cargo.amount,Math.max(0,this.capacityFor(type)-this.inventory[type]));
    if(!this.rooms)this.inventory[type]+=amount;
    if(amount>0){this.delivered+=amount;ant.cargo.amount-=amount;}
    if(ant.cargo.amount===0){this.completedTrips++;this.resetAnt(ant);}
    else {this.setPhase(ant,'wait-storage');}
  }
  resetAnt(ant) {
    this.releaseReservation(ant);
    ant.cargo=null;ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;
  }
  tick() {
    this.tickCount++;
    const entry=this.world.entrances[0];
    const surface=this.world.layers[SURFACE], underground=this.world.layers[UNDERGROUND];
    const depot={x:this.colony.queen.x,y:this.colony.queen.y};
    for (const ant of this.colony.workers) {
      if(ant.state==='idle') this.beginTrip(ant);
      if(!ant.state.startsWith('forage-'))continue;
      const phase=ant.state.slice(7);
      if(phase==='to-portal') {
        if(ant.layer!==UNDERGROUND){this.failTrip(ant);continue;}
        if(this.walk(ant,underground,entry.underground)) {
          ant.layer=SURFACE;ant.x=entry.surface.x;ant.y=entry.surface.y;
          this.setPhase(ant,'to-source');
        }
      } else if(phase==='to-source') {
        const node=this.nodes.find(n=>n.id===ant.resourceId);
        if(!node || node.amount<=0){this.failTrip(ant);continue;}
        if(this.walk(ant,surface,node)) {
          ant.gatherTicks=0;
          this.setPhase(ant,'gather');
        }
      } else if(phase==='gather') {
        const node=this.nodes.find(n=>n.id===ant.resourceId);
        if(!node || !at(ant,node)){this.failTrip(ant);continue;}
        if(++ant.gatherTicks<GATHER_TICKS)continue;
        const quantity=Math.min(ant.reservedAmount,node.amount);
        this.releaseReservation(ant);
        if(quantity<=0){this.setPhase(ant,'return-empty');continue;}
        node.amount-=quantity;
        ant.cargo={type:node.type,amount:quantity};
        this.setPhase(ant,'return-surface');
      } else if (phase==='return-surface' || phase==='return-empty') {
        if(this.walk(ant,surface,entry.surface)) {
          ant.layer=UNDERGROUND;ant.x=entry.underground.x;ant.y=entry.underground.y;
          this.setPhase(ant,phase==='return-empty'?'home-empty':'return-underground');
        }
      } else if(phase==='return-underground'||phase==='home-empty') {
        if(phase==='home-empty') {
          if(this.walk(ant,underground,depot))this.resetAnt(ant);
        } else this.deliverCargo(ant,underground,depot);
      } else if(phase==='wait-storage') {
        this.deliverCargo(ant,underground,depot);
      }
    }
  }
}
