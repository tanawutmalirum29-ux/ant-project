import { UNDERGROUND, TERRAINS } from '../world/generate.js';
import { findPath, isWalkable, reachablePaths } from '../world/navigation.js';
import { WORKER_SPEED } from './colony.js';

// All durations are simulation ticks (10 ticks / real second at x1).
export const LIFE = Object.freeze({
  layInterval: 180, eggTicks: 100, larvaTicks: 180, pupaTicks: 160,
  requiredCare: 90, broodLimit: 18, feedInterval: 850, drinkInterval: 1300,
  workerStarve: 2700, workerThirst: 3200, queenStarve: 4000,
  broodTimeout: 1200, maxPopulation: 150, workerMaxAge: 18000, queenMaxAge: 240000
});
const NUTRIENTS = ['carbs', 'protein', 'water'];
const same = (a,b) => a.x === b.x && a.y === b.y;

/** U4 lifecycle owns reproduction, brood care, adult nutrition and natural death.
 * Only stock already delivered to the nest may be consumed.
 * Every consumed or lost resource unit is separately accounted for. */
export class Lifecycle {
  constructor(colony, foraging) {
    this.colony=colony;
    this.foraging=foraging;
    this.rooms=null;
    this.brood=[];
    this.eggOrders=[];
    // Opt-in presets are commands, never inventory; a fresh Game starts empty.
    this.repeatPlans=new Map();
    this.nextEggId=1;
    this.heldEgg={carbs:0,protein:0,water:0};
    this.eggSpent={carbs:0,protein:0,water:0};
    this.nextBroodId=1;
    this.nurseSlots=1;
    this.tickCount=0;
    this.births=0;
    this.workerDeaths=0;
    this.broodDeaths=0;
    this.consumed={carbs:0,protein:0,water:0};
    this.lost={carbs:0,protein:0,water:0};
    this.queenHealth={age:0,hunger:0,thirst:0};
    this.adultHealth=new Map(colony.workers.map(a=>[a.id,{age:0,hunger:0,thirst:0}]));
    this.nextWorkerId=colony.workers.length+1;
    this.lastEvent='กำลังเตรียมรังสำหรับขยายอาณาจักร';
  }
  get eggs() { return this.brood.filter(b=>b.stage==='egg').length; }
  get larvae() { return this.brood.filter(b=>b.stage==='larva').length; }
  get pupae() { return this.brood.filter(b=>b.stage==='pupa').length; }
  get nurseCount() { return this.colony.workers.filter(a=>a.state==='nursing').length; }
  get totalPopulation() { return this.colony.population+this.brood.length+this.eggOrders.filter(o=>o.status==='QUEUED').length; }
  eggCost(profession,level) {
    const table={miner:[1,1],forager:[1,1],builder:[2,1],nurse:[1,2],soldier:[2,3]};
    if(typeof profession!=='string'||!Object.hasOwn(table,profession)||
       !Number.isInteger(level)||level<1||level>5)return null;
    const row=table[profession];
    return {carbs:row[0]*level,protein:row[1]*level};
  }
  nurseryStatus(roomId) {
    const room=this.rooms?.rooms.find(r=>r.id===roomId&&r.type==='nursery');
    if(!room)return null;
    const orders=this.eggOrders.filter(o=>o.roomId===roomId);
    const slots=Math.min(room.width*room.height,16);
    return {slots,used:orders.length,free:Math.max(0,slots-orders.length),orders};
  }
  queueEgg(roomId,profession,level) {
    const cost=this.eggCost(profession,level);
    if(!cost)return {ok:false,reason:'invalid-choice'};
    const room=this.rooms?.rooms.find(r=>r.id===roomId&&r.type==='nursery');
    if(!room)return {ok:false,reason:'invalid-room'};
    if(room.status!=='ready'||!room.connected||!this.rooms.reachable(room))
      return {ok:false,reason:'nursery-unavailable'};
    if(!this.colony.queen.alive)return {ok:false,reason:'queen-dead'};
    if(this.totalPopulation>=LIFE.maxPopulation)return {ok:false,reason:'population-cap'};
    const status=this.nurseryStatus(roomId);
    if(!status?.free)return {ok:false,reason:'nursery-full'};
    this.rooms.syncInventory();
    const sources={};
    for(const [type,qty] of Object.entries(cost)){
      let need=qty,parts=[];
      for(const {room:source} of this.rooms.storageSlots(type)){
        if(!source.connected)continue;
        const stored=source.stock?.[type];
        const count=Math.min(need,Number.isSafeInteger(stored)&&stored>0?stored:0);
        if(count>0){parts.push({sourceRoomId:source.id,type,amount:count});need-=count;}
        if(!need)break;
      }
      if(need)return {ok:false,reason:'insufficient-resources'};
      sources[type]=parts;
    }
    const taken=new Set(status.orders.map(o=>o.slot && o.slot.x+','+o.slot.y));
    const slot=this.rooms.footprint(room).slice(0,status.slots).find(t=>!taken.has(t.x+','+t.y));
    if(!slot)return {ok:false,reason:'nursery-full'};
    const pickups=Object.values(sources).flat();
    for(const part of pickups){
      const source=this.rooms.rooms.find(r=>r.id===part.sourceRoomId);
      source.stock[part.type]-=part.amount;
      this.foraging.inventory[part.type]-=part.amount;
      this.heldEgg[part.type]+=part.amount;
    }
    const stages=this.hatchStages(level);
    const ticks=stages.egg+stages.larva+stages.pupa;
    const order={id:'egg-'+this.nextEggId++,roomId,profession,level,status:'QUEUED',
      slot:{x:slot.x,y:slot.y},x:null,y:null,hatchTicks:ticks,remainingTicks:ticks,
      cost,pickups,broodId:null};
    this.eggOrders.push(order);
    this.lastEvent='จองไข่ '+profession+' Lv.'+level+' แล้ว';
    return {ok:true,reason:'ok',order};
  }
  /** Serializable, immutable view: callers must not mutate the authoritative plan. */
  getRepeatOrder(roomId) {
    const room=this.rooms?.rooms.find(r=>r.id===roomId&&r.type==='nursery');
    if(!room)return {ok:false,reason:'invalid-room',plan:null};
    const plan=this.repeatPlans.get(roomId);
    return {ok:true,reason:'ok',plan:Object.freeze(plan?{...plan}:{
      roomId,enabled:false,profession:'miner',level:1,state:'disabled',
      activeOrderId:null,stopReason:null
    })};
  }
  /** Explicit user command. No stock is ever debited until an advancing tick. */
  setRepeatOrder(roomId,profession,level,enabled) {
    const room=this.rooms?.rooms.find(r=>r.id===roomId&&r.type==='nursery');
    if(!room)return {ok:false,reason:'invalid-room',plan:null};
    if(!this.eggCost(profession,level)||typeof enabled!=='boolean')
      return {ok:false,reason:'invalid-choice',plan:this.getRepeatOrder(roomId).plan};
    const previous=this.repeatPlans.get(roomId);
    const plan=previous?{...previous}:{
      roomId,enabled:false,profession,level,state:'disabled',
      activeOrderId:null,stopReason:null
    };
    plan.profession=profession;plan.level=level;plan.enabled=enabled;
    plan.state=enabled?(plan.activeOrderId?'waiting':'armed'):'disabled';
    plan.stopReason=null;
    this.repeatPlans.set(roomId,plan);
    return this.getRepeatOrder(roomId);
  }
  /** Tracks outcome before the real brood/order is removed from the ledger. */
  finishRepeatOrder(orderId,lost) {
    for(const plan of this.repeatPlans.values()){
      if(plan.activeOrderId!==orderId)continue;
      plan.activeOrderId=null;
      if(plan.enabled && plan.state!=='paused'){
        plan.state=lost?'paused':'armed';
        plan.stopReason=lost?'brood-lost':null;
      }
      return;
    }
  }
  /** Runs once per advancing fixed tick, after manually requested actions + brood. */
  tickRepeatOrders() {
    for(const roomId of [...this.repeatPlans.keys()].sort()){
      const plan=this.repeatPlans.get(roomId);
      if(!plan.enabled||plan.state==='paused')continue;
      if(!this.colony.queen.alive){
        plan.state='paused';plan.stopReason='queen-dead';continue;
      }
      const room=this.rooms?.rooms.find(r=>r.id===roomId&&r.type==='nursery');
      if(!room){plan.state='paused';plan.stopReason='invalid-room';continue;}
      if(room.status!=='ready'||!room.connected||!this.rooms.reachable(room)){
        plan.state='paused';plan.stopReason='nursery-unavailable';continue;
      }
      if(plan.activeOrderId){
        if(this.eggOrders.some(order=>order.id===plan.activeOrderId)){
          plan.state='waiting';continue;
        }
        // Never assume a vanished brood was successfully promoted.
        plan.state='paused';plan.stopReason='brood-lost';
        plan.activeOrderId=null;
        continue;
      }
      const result=this.queueEgg(roomId,plan.profession,plan.level);
      if(result.ok){
        plan.activeOrderId=result.order.id;
        plan.state='waiting';plan.stopReason=null;
      } else {
        plan.state='paused';plan.stopReason=result.reason;
      }
    }
  }
  cancelEgg(orderId) {
    const order=this.eggOrders.find(o=>o.id===orderId&&o.status==='QUEUED');
    if(!order)return false;
    // Never partially refund or redistribute when an original depot is missing.
    if(order.pickups.some(p=>!this.rooms.rooms.some(r=>r.id===p.sourceRoomId)))return false;
    for(const part of order.pickups){
      const room=this.rooms.rooms.find(r=>r.id===part.sourceRoomId);
      room.stock[part.type]+=part.amount;
      this.foraging.inventory[part.type]+=part.amount;
      this.heldEgg[part.type]-=part.amount;
    }
    this.eggOrders.splice(this.eggOrders.indexOf(order),1);
    for(const plan of this.repeatPlans.values()){
      if(plan.activeOrderId!==orderId)continue;
      plan.activeOrderId=null;
      if(plan.enabled){
        plan.state='paused';
        plan.stopReason=this.colony.queen.alive?'manual-cancel':'queen-dead';
      }
      break;
    }
    this.lastEvent='ยกเลิกคิวไข่และคืนทรัพยากรแล้ว';
    return true;
  }
  orderOf(baby){return this.eggOrders.find(o=>o.broodId===baby.id)||null;}
  hatchStages(level){
    const total=[440,560,720,900,1140][level-1]||440;
    const egg=Math.round(total*100/440),larva=Math.round(total*180/440);
    if(this.research?.hasCompleted('nursery_care')!==true)
      return {egg,larva,pupa:total-egg-larva};
    // Adjust real incubation thresholds only, not delivery or required care.
    const targetTotal=Math.round(total*90/100);
    const fasterEgg=Math.floor(egg*90/100),fasterLarva=Math.floor(larva*90/100);
    return {egg:fasterEgg,larva:fasterLarva,pupa:targetTotal-fasterEgg-fasterLarva};
  }
  setNurseSlots(n,fromPolicy=false) {
    if(!Number.isInteger(n)||n<0||n>this.colony.workers.length) throw new RangeError('Invalid nurse count');
    if(!fromPolicy)this.workforce?.disableAuto('nurse');
    this.nurseSlots=n;
    this.releaseExcessNurses();
  }
  consume(type, amount=1) {
    if(!NUTRIENTS.includes(type)||!Number.isSafeInteger(amount)||amount<1) throw new RangeError('Invalid nutrient');
    if(this.rooms ? !this.rooms.take(type,amount) : this.foraging.inventory[type]<amount) return false;
    if(!this.rooms)this.foraging.inventory[type]-=amount;
    this.consumed[type]+=amount;
    return true;
  }
  /** One grounded brood per tile; in-transit destinations are reserved as well. */
  occupiedBroodTile(x,y,except=null) {
    return this.brood.some(b=>b!==except &&
      ((!b.carrierId && b.x===x && b.y===y) ||
       (b.targetTile?.x===x && b.targetTile?.y===y)));
  }
  /** Lay beside (never underneath) the queen; if all safe tiles are full, pause laying. */
  layingSite() {
    const q=this.colony.queen, layer=this.colony.world.layers[UNDERGROUND];
    const reach=reachablePaths(layer,q);
    if(!reach)return null;
    const tiles=[];
    for(let y=q.y-3;y<=q.y+3;y++)for(let x=q.x-3;x<=q.x+3;x++){
      const d=Math.abs(x-q.x)+Math.abs(y-q.y);
      if(d===0||d>3||reach.distance(x,y)<0||this.occupiedBroodTile(x,y)||
         this.rooms?.getRoom(x,y))continue;
      tiles.push({x,y,d});
    }
    // Closest available safe chamber tile first; deterministic tied ordering.
    tiles.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
    return tiles[0]||null;
  }
  /** Reserved egg orders keep one destination; never migrate across nurseries. */
  nurseryDestination(baby,ant){
    const order=this.orderOf(baby);
    if(!order)return null;
    const room=this.rooms?.rooms.find(r=>r.id===order.roomId);
    if(!room||room.status!=='ready'||!room.connected)return null;
    const tile=order.slot;
    const reach=reachablePaths(this.colony.world.layers[UNDERGROUND],ant);
    if(!reach||reach.distance(tile.x,tile.y)<0)return null;
    return {tile,roomId:room.id,kind:'nursery'};
  }
  /** No nursery yet: nursing ants use reachable chamber / tunnel staging tiles. */
  temporaryDestination(baby,ant) {
    const q=this.colony.queen,layer=this.colony.world.layers[UNDERGROUND];
    const reach=reachablePaths(layer,ant);
    if(!reach)return null;
    const spots=[];
    for(let y=q.y-9;y<=q.y+9;y++)for(let x=q.x-9;x<=q.x+9;x++){
      const d=Math.abs(x-q.x)+Math.abs(y-q.y);
      if(d<4||d>9||reach.distance(x,y)<0||
         this.rooms?.getRoom(x,y)||this.occupiedBroodTile(x,y,baby))continue;
      const terrain=layer.cells[y*layer.width+x];
      spots.push({x,y,d,terrain,travel:reach.distance(x,y)});
    }
    // Prefer previously hollowed chamber floors, then low-cost connected paths.
    spots.sort((a,b)=>(a.terrain===TERRAINS.CHAMBER?0:1)-(b.terrain===TERRAINS.CHAMBER?0:1)||
      a.travel-b.travel||a.d-b.d||a.y-b.y||a.x-b.x);
    return spots.length?{tile:{x:spots[0].x,y:spots[0].y},roomId:null,kind:'temporary'}:null;
  }
  /** A damaged nursery or path never teleports its occupants to safety. */
  isValidBroodSite(baby) {
    if(baby.carrierId)return true;
    const map=this.colony.world.layers[UNDERGROUND];
    if(!isWalkable(map,baby.x,baby.y))return false;
    if(baby.roomId){
      const room=this.rooms?.rooms.find(r=>r.id===baby.roomId);
      return !!room && room.type==='nursery' && room.status==='ready' &&
        room.connected && this.rooms.footprint(room).some(t=>same(t,baby));
    }
    return baby.site==='temporary' && !this.rooms?.getRoom(baby.x,baby.y);
  }
  /** A nurse, not an instantaneous assignment, carries every relocated brood. */
  clearBroodCarry(ant) {
    for(const baby of this.brood){
      if(baby.pickupBy!==ant.id && baby.carrierId!==ant.id)continue;
      if(baby.carrierId===ant.id){
        baby.x=ant.x;baby.y=ant.y;baby.roomId=null;baby.site='fresh';
        baby.carrierId=null;
      }
      baby.pickupBy=null;
      const order=this.orderOf(baby);
      if(order){baby.targetRoomId=order.roomId;baby.targetTile=order.slot;baby.targetKind='nursery';order.status='WAITING_ROUTE';}
      else {baby.targetRoomId=null;baby.targetTile=null;baby.targetKind=null;}
    }
    ant.broodCargo=null;
  }
  /** Remove stale work assignments, release source reservations, account for lost cargo. */
  killWorker(ant) {
    if(!this.colony.workers.includes(ant)) return false;
    if(ant.orderId!=null) {
      const job=this.colony.ordersById.get(ant.orderId);
      if(job && job.workerId===ant.id) {job.workerId=null;job.status='queued';}
    }
    this.clearBroodCarry(ant);
    this.rooms?.onWorkerDeath(ant);
    this.foraging.releaseReservation(ant);
    if(ant.cargo?.amount) {
      this.lost[ant.cargo.type]+=ant.cargo.amount;
    }
    this.colony.workers.splice(this.colony.workers.indexOf(ant),1);
    this.colony.forageSlots=Math.min(this.colony.forageSlots,this.colony.workers.length);
    this.nurseSlots=Math.min(this.nurseSlots,this.colony.workers.length);
    this.adultHealth.delete(ant.id);
    this.workerDeaths++;
    this.lastEvent='มดงานตาย ต้องจัดกำลังงานใหม่';
    return true;
  }
  releaseNurse(ant) {
    if(ant.state!=='nursing') return;
    this.clearBroodCarry(ant);
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;ant.nurseDestination=null;
  }
  releaseExcessNurses() {
    const nurses=this.colony.workers.filter(a=>a.state==='nursing');
    const max=this.brood.length ? this.nurseSlots : 0;
    // Finish any already-carried brood delivery before downsizing nurse quota.
    // Other nurses can be released immediately; no egg is dropped on a slider drag.
    let surplus=nurses.length-max;
    for(const nurse of nurses) {
      if(surplus<=0)break;
      if(nurse.broodCargo)continue;
      this.releaseNurse(nurse);surplus--;
    }
  }
  assignNurses() {
    this.releaseExcessNurses();
    if(!this.brood.length) return;
    const shortage=this.nurseSlots-this.nurseCount;
    if(shortage<=0)return;
    let count=0;
    for(const ant of this.colony.workers) {
      if(ant.state!=='idle'||ant.orderId!=null||ant.layer!==UNDERGROUND||this.colony.isForager(ant)||this.colony.canWork?.(ant,'nurse')===false)continue;
      this.colony.stopAmbient(ant);
      ant.state='nursing';ant.path=[];ant.next=null;ant.motion=0;
      if(++count===shortage) break;
    }
  }
  // Movement uses the same walkable grid, one tile at a time, as digging and foraging.
  nurseWalk(ant,destination) {
    const layer=this.colony.world.layers[UNDERGROUND];
    if(!destination||!isWalkable(layer,ant.x,ant.y)||!isWalkable(layer,destination.x,destination.y))return false;
    const destinationKey=`${destination.x},${destination.y}`;
    if(ant.nurseDestination!==destinationKey){ant.path=[];ant.next=null;ant.motion=0;ant.nurseDestination=destinationKey;}
    if(same(ant,destination))return true;
    if(ant.next && (!isWalkable(layer,ant.next.x,ant.next.y)||Math.abs(ant.next.x-ant.x)+Math.abs(ant.next.y-ant.y)!==1)){
      ant.path=[];ant.next=null;ant.motion=0;return false;
    }
    if(!ant.next&&!ant.path.length){
      const path=findPath(layer,ant,destination);
      if(!path)return false;
      ant.path=path;
    }
    if(!ant.next){
      const step=ant.path[0];
      if(!step||!isWalkable(layer,step.x,step.y)||Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1){ant.path=[];return false;}
      ant.next=step;ant.motion=0;
      ant.facing=step.x>ant.x?1:step.x<ant.x?3:step.y>ant.y?2:0;
    }
    ant.motion+=WORKER_SPEED;
    if(ant.motion>=1){ant.x=ant.next.x;ant.y=ant.next.y;ant.path.shift();ant.motion=0;ant.next=null;}
    return same(ant,destination);
  }
  stepNurses() {
    const queen=this.colony.queen;
    const layer=this.colony.world.layers[UNDERGROUND];
    const caretakers=[];
    const nurses=this.colony.workers.filter(a=>a.state==='nursing');
    for(const ant of nurses){
      if(ant.layer!==UNDERGROUND||!isWalkable(layer,ant.x,ant.y)){this.releaseNurse(ant);continue;}
      if(ant.broodCargo){
        const baby=this.brood.find(b=>b.id===ant.broodCargo);
        const room=baby?.targetRoomId?this.rooms?.rooms.find(r=>r.id===baby.targetRoomId&&r.status==='ready'&&r.connected):null;
        if(!baby){ant.broodCargo=null;continue;}
        if(!room){const order=this.orderOf(baby);if(order)order.status='WAITING_ROUTE';continue;}
        const valid=!!baby.targetTile && isWalkable(layer,baby.targetTile.x,baby.targetTile.y);
        if(!valid){const order=this.orderOf(baby);if(order)order.status='WAITING_ROUTE';continue;}
        // Route lost while carrying: leave brood at the carrier's actual tile.
        if(findPath(layer,ant,baby.targetTile)===null){
          this.clearBroodCarry(ant);
          this.releaseNurse(ant);
          continue;
        }
        const arrived=this.nurseWalk(ant,baby.targetTile);
        const order=this.orderOf(baby);if(order)order.status=arrived?'INCUBATING':'CARRYING';
        baby.x=ant.x;baby.y=ant.y;
        if(arrived) {
          baby.carrierId=null;baby.pickupBy=null;baby.roomId=room?.id||null;
          baby.site=room?'nursery':'temporary';
          baby.targetRoomId=null;baby.targetTile=null;baby.targetKind=null;
          ant.broodCargo=null;ant.path=[];ant.next=null;ant.motion=0;
        }
        continue;
      }
      // Prefer transferring unassigned brood into real nurseries. Without one,
      // physically move fresh/unhoused brood to spread-out temporary nest tiles.
      let moving=null;
      for(const baby of this.brood) {
        if(baby.carrierId||(baby.pickupBy&&baby.pickupBy!==ant.id))continue;
        if(!isWalkable(layer,baby.x,baby.y))continue;
        if(findPath(layer,ant,baby)===null){
          if(baby.pickupBy===ant.id){
            baby.pickupBy=null;
            const order=this.orderOf(baby);
            if(order)order.status='WAITING_ROUTE';
          }
          continue;
        }
        if(baby.pickupBy===ant.id&&baby.targetTile){moving=baby;break;}
        if(baby.roomId)continue;
        const destination=this.nurseryDestination(baby,ant);
        if(!destination)continue;
        baby.pickupBy=ant.id;baby.targetTile=destination.tile;
        baby.targetRoomId=destination.roomId;baby.targetKind=destination.kind;
        moving=baby;break;
      }
      if(moving) {
        const origin={x:moving.x,y:moving.y};
        const picked=this.nurseWalk(ant,origin);
        const order=this.orderOf(moving);
        if(order)order.status=picked?'CARRYING':picked===false?'AWAITING_PICKUP':'WAITING_ROUTE';
        if(picked){
          moving.carrierId=ant.id;
          ant.broodCargo=moving.id;ant.path=[];ant.next=null;ant.motion=0;
        }
        continue;
      }
      // Actual care requires an actual trip to the larva's current tile.
      const larvae=this.brood.filter(b=>b.stage==='larva'&&!b.carrierId&&b.care<LIFE.requiredCare);
      const baby=larvae.find(b=>findPath(layer,ant,{x:b.x,y:b.y})!==null);
      const destination=baby?{x:baby.x,y:baby.y}:queen;
      if(this.nurseWalk(ant,destination) && baby && same(ant,destination))caretakers.push({ant,baby});
    }
    for(const {ant,baby} of caretakers) {
      const room=baby.roomId?this.rooms?.rooms.find(r=>r.id===baby.roomId):null;
      if(room?.status==='ready')baby.care+=Math.min(3,1+Math.floor(((ant.level||1)-1)/2));
    }
  }
  tickAdults() {
    const adults=[...(this.colony.queen.alive?[this.colony.queen]:[]),...this.colony.workers];
    for(const ant of adults){
      let health=ant.caste==='queen'?this.queenHealth:this.adultHealth.get(ant.id);
      if(!health) {health={age:0,hunger:0,thirst:0};this.adultHealth.set(ant.id,health);}
      health.age++;health.hunger+=this.rooms?.isResting(ant)?0.5:1;health.thirst++;
      if(health.hunger>=LIFE.feedInterval && this.consume('carbs')) health.hunger=0;
      if(health.thirst>=LIFE.drinkInterval && this.consume('water')) health.thirst=0;
      const limit=ant.caste==='queen'?LIFE.queenStarve:LIFE.workerStarve;
      const dying=health.hunger>limit || health.thirst>(ant.caste==='queen'?LIFE.queenStarve+600:LIFE.workerThirst) || health.age>=(ant.caste==='queen'?LIFE.queenMaxAge:LIFE.workerMaxAge);
      if(dying){
        if(ant.caste==='queen') {ant.alive=false;this.lastEvent='นางพญาสิ้นชีวิต — อาณาจักรไม่สามารถเพิ่มประชากรได้';}
        else this.killWorker(ant);
      }
    }
  }
  layEgg() {
    if(!this.colony.queen.alive||this.tickCount%LIFE.layInterval!==0)return;
    const order=this.eggOrders.find(o=>o.status==='QUEUED' &&
      this.rooms?.rooms.some(r=>r.id===o.roomId&&r.status==='ready'&&r.connected));
    if(!order)return;
    const site=this.layingSite();
    if(!site){this.lastEvent='ที่วางไข่ใกล้นางพญาเต็ม — รอทางว่าง';return;}
    for(const part of order.pickups){
      this.heldEgg[part.type]-=part.amount;
      this.eggSpent[part.type]+=part.amount;
    }
    const baby={id:'brood-'+this.nextBroodId++,orderId:order.id,profession:order.profession,level:order.level,
      stage:'egg',age:0,care:0,waiting:0,x:site.x,y:site.y,site:'fresh',roomId:null,
      carrierId:null,pickupBy:null,targetRoomId:order.roomId,targetTile:order.slot,targetKind:'nursery'};
    order.broodId=baby.id;order.x=site.x;order.y=site.y;order.status='AWAITING_PICKUP';
    this.brood.push(baby);
    this.lastEvent='นางพญาวางไข่แล้ว — รอมดพี่เลี้ยงขนไปห้องฟัก';
  }
  promote(baby) {
    const q=this.colony.queen;
    const n=this.nextWorkerId++;
    const ant={id:`worker-${n}`,caste:'worker',profession:baby.profession||'starter',level:baby.level||1,
      layer:UNDERGROUND,x:baby.x??q.x,y:baby.y??q.y,
      facing:n%4,next:null,motion:0,path:[],orderId:null,state:'idle'};
    if(ant.profession==='soldier'){
      ant.combatRole='soldier';ant.squadId='A';
      // Combat is wired by CEO. Do not temporarily spawn at legacy HP when
      // soldier armor is already researched; existing soldiers never auto-heal.
      ant.combatHP=this.combat?.maxHP(ant)??16+3*(ant.level-1);
      ant.combatCooldown=0;ant.state='combat-guard';
    }
    this.colony.workers.push(ant);
    this.adultHealth.set(ant.id,{age:0,hunger:0,thirst:0});
    this.births++;
    this.lastEvent='มดงานตัวใหม่ฟักเป็นตัวเต็มวัย';
  }
  tickBrood(){
    for(const baby of [...this.brood]){
      const order=this.orderOf(baby);
      if(!order)continue;
      const room=this.rooms?.rooms.find(r=>r.id===order.roomId);
      // An egg grows only after physical delivery to its reserved, connected Nursery.
      if(order.status!=='INCUBATING'||!room||room.status!=='ready'||!room.connected||
         baby.carrierId||baby.roomId!==order.roomId)continue;
      baby.age++;
      const stages=this.hatchStages(baby.level);
      if(baby.stage==='egg'&&baby.age>=stages.egg){baby.stage='larva';baby.age=0;baby.waiting=0;}
      else if(baby.stage==='larva'&&baby.age>=stages.larva&&baby.care>=LIFE.requiredCare){
        if(this.consume('protein')){baby.stage='pupa';baby.age=0;baby.waiting=0;}
        else baby.waiting++;
      }else if(baby.stage==='pupa'&&baby.age>=stages.pupa){
        const survived=this.totalPopulation<=LIFE.maxPopulation;
        if(survived)this.promote(baby);
        else this.broodDeaths++;
        this.brood.splice(this.brood.indexOf(baby),1);
        this.finishRepeatOrder(order.id,!survived);
        this.eggOrders.splice(this.eggOrders.indexOf(order),1);
        continue;
      }else if(baby.stage==='larva'&&baby.age>=stages.larva){baby.waiting++;}
      if(baby.waiting>LIFE.broodTimeout){
        this.brood.splice(this.brood.indexOf(baby),1);
        this.finishRepeatOrder(order.id,true);
        this.eggOrders.splice(this.eggOrders.indexOf(order),1);
        this.broodDeaths++;this.lastEvent='ตัวอ่อนขาดการดูแลหรือโปรตีน';
        continue;
      }
      const left=stages[baby.stage]-baby.age;
      order.remainingTicks=Math.max(0,left+(baby.stage==='egg'?stages.larva+stages.pupa:baby.stage==='larva'?stages.pupa:0));
    }
  }
  tick(){
    this.tickCount++;
    // An already-queued egg must show the upgraded incubation target too;
    // work accumulated before unlock is never erased.
    if(this.research?.hasCompleted('nursery_care')===true)
      for(const order of this.eggOrders) {
        const stages=this.hatchStages(order.level);
        order.hatchTicks=stages.egg+stages.larva+stages.pupa;
        if(order.status==='QUEUED')order.remainingTicks=order.hatchTicks;
      }
    this.tickAdults();
    if(!this.colony.queen.alive)for(const order of [...this.eggOrders])if(order.status==='QUEUED')this.cancelEgg(order.id);
    this.layEgg();
    this.assignNurses();
    this.stepNurses();
    this.tickBrood();
    this.tickRepeatOrders();
    this.releaseExcessNurses();
  }
}
