import { SURFACE, UNDERGROUND } from '../world/generate.js';
import { findPath, isWalkable, reachablePaths } from '../world/navigation.js';
import { WORKER_SPEED } from './colony.js';
import { RESOURCE_TYPES } from '../world/resources.js';

export const CARRY_CAPACITY = 3;
export const GATHER_TICKS = 5;
const RETRY_TICKS = 12;
const at = (a,b) => a.x === b.x && a.y === b.y;
const compareId = (a,b) => a < b ? -1 : a > b ? 1 : 0;

/** Finite physical gathering: claims do not create mass, and only actual deliveries credit stock. */
export class Foraging {
  constructor(world, colony) {
    this.world = world;
    this.colony = colony;
    this.nodes = world.resources;
    this.inventory = { carbs:0, protein:0, water:0 };
    this.delivered = 0;
    this.completedTrips = 0;
    this.tickCount = 0;
    this.rooms = null; // Supplied by Game; ecology is independent.
    // Private, disposable scheduler hints; never part of the resource-node contract.
    this.retryAt = new WeakMap();
    this.sourceRoutes = new WeakMap();
    this.deliveryTargets = new WeakMap();
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
    this.sourceRoutes.delete(ant);
  }
  /** true: arrived, false: moving, null: no walkable route. Never commits an invalid step. */
  walk(ant, layer, goal) {
    if (!isWalkable(layer,ant.x,ant.y) || !isWalkable(layer,goal.x,goal.y)) return null;
    if (ant.next) {
      const step=ant.next, first=ant.path[0];
      if (!first || !at(step,first) || !isWalkable(layer,step.x,step.y) ||
          Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1) {
        ant.next=null;ant.path=[];ant.motion=0;
      }
    }
    if (!ant.next && ant.path.length) {
      const first=ant.path[0];
      if (!isWalkable(layer,first.x,first.y) ||
          Math.abs(first.x-ant.x)+Math.abs(first.y-ant.y)!==1) ant.path=[];
    }
    if (!ant.next && !ant.path.length && !at(ant,goal)) {
      const route=findPath(layer,ant,goal);
      if (!route) return null;
      ant.path=route;
    }
    if (!ant.next && ant.path.length) {
      const step=ant.path[0];
      ant.next=step;ant.motion=0;
      ant.facing=step.x>ant.x?1:step.x<ant.x?3:step.y>ant.y?2:0;
    }
    if (ant.next) {
      ant.motion += WORKER_SPEED;
      if (ant.motion >= 1) {
        // Revalidate at the commit boundary (the layer may have changed).
        if (!isWalkable(layer,ant.next.x,ant.next.y)) {
          ant.next=null;ant.path=[];ant.motion=0;return null;
        }
        ant.x=ant.next.x;ant.y=ant.next.y;ant.next=null;ant.motion=0;ant.path.shift();
      }
    }
    return !ant.next && ant.path.length===0 && at(ant,goal);
  }
  setPhase(ant, phase, path=[]) {
    ant.state='forage-'+phase;ant.path=path;ant.next=null;ant.motion=0;
  }

  /** Compute route reachability once per assignment, not once per candidate per tick. */
  chooseSource(ant) {
    if (ant.layer!==UNDERGROUND) return null;
    this.rooms?.syncInventory();
    const entrance=this.world.entrances[0];
    const underground=this.world.layers[UNDERGROUND], surface=this.world.layers[SURFACE];
    const fromAnt=reachablePaths(underground,ant);
    const toSurface=reachablePaths(surface,entrance.surface);
    if (!fromAnt || !toSurface || fromAnt.distance(entrance.underground.x,entrance.underground.y)<0) return null;
    const portalPath=fromAnt.path(entrance.underground.x,entrance.underground.y);
    const stock={},pending={},space={};
    for (const type of RESOURCE_TYPES) {
      stock[type]=Math.max(0,this.inventory[type]||0);
      pending[type]=0;
    }
    for (const worker of this.colony.workers) {
      const cargo=worker.cargo;
      if (cargo?.amount>0 && Object.hasOwn(pending,cargo.type)) pending[cargo.type]+=cargo.amount;
      if (worker.resourceId && worker.reservedAmount>0) {
        const reserved=this.nodes.find(n=>n.id===worker.resourceId);
        if (reserved && Object.hasOwn(pending,reserved.type)) pending[reserved.type]+=worker.reservedAmount;
      }
    }
    // Only storage accessible from the actual underground portal can accept new deliveries.
    const fromPortal=this.rooms ? reachablePaths(underground,entrance.underground) : null;
    for (const type of RESOURCE_TYPES) {
      const capacity=this.capacityFor(type);
      if (!this.rooms) {
        space[type]=Math.max(0,capacity-stock[type]-pending[type]);
      } else {
        let reachableSpace=0;
        if (fromPortal) for (const slot of this.rooms.storageSlots(type)) {
          if (slot.space<=0)continue;
          const tiles=this.rooms.footprint(slot.room);
          if (tiles.some(tile=>fromPortal.distance(tile.x,tile.y)>=0)) reachableSpace+=slot.space;
        }
        space[type]=Math.max(0,Math.min(capacity-stock[type],reachableSpace)-pending[type]);
      }
    }
    const choices=[];
    for (const node of this.nodes) {
      if (!Object.hasOwn(space,node.type) || space[node.type]<=0) continue;
      const free=node.amount-node.reserved;
      if (!Number.isFinite(free) || free<=0) continue;
      const distance=toSurface.distance(node.x,node.y);
      if (distance<0)continue;
      const quantity=Math.min(CARRY_CAPACITY,Math.floor(free),Math.floor(space[node.type]));
      if (quantity<=0)continue;
      // Normalize stocks by real capacity, include all cargo and claims, then trade off walking.
      const saturation=(stock[node.type]+pending[node.type])/Math.max(1,this.capacityFor(node.type));
      const score=saturation*100 + distance*0.45;
      choices.push({node,quantity,distance,score});
    }
    choices.sort((a,b)=>a.score-b.score || a.distance-b.distance || compareId(a.node.id,b.node.id));
    if (!choices.length)return null;
    const best=choices[0];
    return {...best,portalPath,sourcePath:toSurface.path(best.node.x,best.node.y)};
  }
  // Preserve the original public node-selection interface for callers/tests.
  pickNode(ant) { return this.chooseSource(ant)?.node || null; }
  beginTrip(ant) {
    if(ant.orderId!=null || ant.state!=='idle' || !this.colony.isForager(ant) ||
       ant.cargo?.amount || ant.layer!==UNDERGROUND || this.tickCount<(this.retryAt.get(ant)||0))return;
    // Cosmetic ambient strolls must not own the first step of a real resource trip.
    this.colony.stopAmbient?.(ant);
    const choice=this.chooseSource(ant);
    if(!choice){this.retryAt.set(ant,this.tickCount+RETRY_TICKS);return;}
    const {node,quantity}=choice;
    // Sequential JS event loop: each worker sees reservations added by earlier workers.
    if(quantity<=0 || node.amount-node.reserved<quantity)return;
    node.reserved+=quantity;
    ant.resourceId=node.id;ant.reservedAmount=quantity;
    this.sourceRoutes.set(ant,choice.sourcePath);
    this.setPhase(ant,'to-portal',choice.portalPath);
  }
  failTrip(ant) {
    this.releaseReservation(ant);
    this.deliveryTargets.delete(ant);
    this.retryAt.set(ant,this.tickCount+RETRY_TICKS);
    if (ant.cargo?.amount) {
      this.setPhase(ant,ant.layer===SURFACE?'return-surface':'return-underground');
    } else if (ant.layer===SURFACE) this.setPhase(ant,'return-empty');
    else this.resetAnt(ant);
  }
  /** A store must be reached physically. Cache delivery destinations, not room contents. */
  deliverCargo(ant, underground, fallback) {
    if(!ant.cargo?.amount){this.resetAnt(ant);return;}
    const type=ant.cargo.type;
    if (this.tickCount<(this.retryAt.get(ant)||0) && ant.state==='forage-wait-storage') {
      // Physical space opening at the CURRENT depot is cheap to check and must
      // permit an immediate partial deposit (legacy U5/ECO behavior).
      this.rooms?.syncInventory(); // Also honor debug/test inventory debits before retrying.
      const localSpace=this.rooms?.storageSlots(type).some(slot=>slot.space>0 &&
        this.rooms.footprint(slot.room).some(tile=>at(tile,ant)));
      if (!localSpace)return;
      this.retryAt.delete(ant);
    }
    let target=this.deliveryTargets.get(ant);
    if (target && this.rooms) {
      const slot=this.rooms.storageSlots(type).find(s=>s.room.id===target.roomId);
      if (!slot || slot.space<=0 || !this.rooms.footprint(slot.room).some(p=>at(p,target.tile))) {
        target=null;this.deliveryTargets.delete(ant);ant.path=[];ant.next=null;ant.motion=0;
      }
    }
    if(!target) {
      const selected=this.rooms?.deliveryTarget(type,ant);
      if (this.rooms && !selected) {
        this.setPhase(ant,'wait-storage');this.retryAt.set(ant,this.tickCount+RETRY_TICKS);return;
      }
      target={roomId:selected?.room.id||null,tile:selected?.site.tile||fallback};
      this.deliveryTargets.set(ant,target);
      this.setPhase(ant,'return-underground');
    }
    const arrived=this.walk(ant,underground,target.tile);
    if(arrived===null) {
      this.deliveryTargets.delete(ant);
      this.setPhase(ant,'wait-storage');
      this.retryAt.set(ant,this.tickCount+RETRY_TICKS);
      return;
    }
    if(!arrived)return;
    const quantity=this.rooms ? this.rooms.depositAt(ant,type,ant.cargo.amount,target.roomId)
      : Math.min(ant.cargo.amount,Math.max(0,this.capacityFor(type)-this.inventory[type]));
    if(!this.rooms)this.inventory[type]+=quantity;
    if(quantity>0){this.delivered+=quantity;ant.cargo.amount-=quantity;}
    this.deliveryTargets.delete(ant);
    if(ant.cargo.amount===0){this.completedTrips++;this.resetAnt(ant);}
    else this.setPhase(ant,'wait-storage');
  }
  resetAnt(ant) {
    this.releaseReservation(ant);
    this.deliveryTargets.delete(ant);
    ant.cargo=null;ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;
  }
  tick() {
    this.tickCount++;
    const entry=this.world.entrances[0];
    const surface=this.world.layers[SURFACE], underground=this.world.layers[UNDERGROUND];
    const depot={x:this.colony.queen.x,y:this.colony.queen.y};
    for (const ant of this.colony.workers) {
      if (ant.state==='idle' && ant.orderId==null && ant.cargo?.amount) {
        this.setPhase(ant,ant.layer===SURFACE?'return-surface':'return-underground');
      }
      if(ant.state==='idle') this.beginTrip(ant);
      if(!ant.state.startsWith('forage-') || ant.orderId!=null)continue;
      const phase=ant.state.slice(7);
      if(phase==='to-portal') {
        if(ant.layer!==UNDERGROUND){this.failTrip(ant);continue;}
        const arrived=this.walk(ant,underground,entry.underground);
        if(arrived===null){this.failTrip(ant);continue;}
        if(arrived) {
          ant.layer=SURFACE;ant.x=entry.surface.x;ant.y=entry.surface.y;
          this.setPhase(ant,'to-source',this.sourceRoutes.get(ant)||[]);
        }
      } else if(phase==='to-source') {
        const node=this.nodes.find(n=>n.id===ant.resourceId);
        if(!node || node.amount<=0 || ant.reservedAmount<=0){this.failTrip(ant);continue;}
        const arrived=this.walk(ant,surface,node);
        if(arrived===null){this.failTrip(ant);continue;}
        if(arrived) {
          ant.gatherTicks=0;
          this.setPhase(ant,'gather');
        }
      } else if(phase==='gather') {
        const node=this.nodes.find(n=>n.id===ant.resourceId);
        if(!node || !at(ant,node) || ant.layer!==SURFACE){this.failTrip(ant);continue;}
        if(++ant.gatherTicks<GATHER_TICKS)continue;
        const quantity=Math.max(0,Math.min(ant.reservedAmount,node.amount,CARRY_CAPACITY));
        this.releaseReservation(ant);
        if(quantity<=0){this.setPhase(ant,'return-empty');continue;}
        node.amount-=quantity;
        ant.cargo={type:node.type,amount:quantity};
        this.setPhase(ant,'return-surface');
      } else if (phase==='return-surface' || phase==='return-empty') {
        if(ant.layer!==SURFACE){this.failTrip(ant);continue;}
        const arrived=this.walk(ant,surface,entry.surface);
        if(arrived===null){this.retryAt.set(ant,this.tickCount+RETRY_TICKS);continue;}
        if(arrived) {
          ant.layer=UNDERGROUND;ant.x=entry.underground.x;ant.y=entry.underground.y;
          this.setPhase(ant,phase==='return-empty'?'home-empty':'return-underground');
        }
      } else if(phase==='return-underground'||phase==='home-empty') {
        if(ant.layer!==UNDERGROUND){this.failTrip(ant);continue;}
        if(phase==='home-empty') {
          const arrived=this.walk(ant,underground,depot);
          if(arrived===true)this.resetAnt(ant);
        } else this.deliverCargo(ant,underground,depot);
      } else if(phase==='wait-storage') {
        if(ant.layer===UNDERGROUND)this.deliverCargo(ant,underground,depot);
        else this.failTrip(ant);
      }
    }
  }
}
