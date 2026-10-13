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
  get totalPopulation() { return this.colony.population+this.brood.length; }
  setNurseSlots(n) {
    if(!Number.isInteger(n)||n<0||n>this.colony.workers.length) throw new RangeError('Invalid nurse count');
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
  /** A real nursery reserves one of its tiles, not a common stacked top-left tile. */
  nurseryDestination(baby,ant) {
    const rooms=this.rooms?.rooms;
    if(!rooms)return null;
    const layer=this.colony.world.layers[UNDERGROUND];
    for(const room of rooms){
      if(room.type!=='nursery'||room.status!=='ready'||!room.connected)continue;
      if(room.id===baby.roomId)continue;
      const reserved=this.brood.filter(b=>b.roomId===room.id||b.targetRoomId===room.id).length;
      if(reserved>=8)continue;
      const reach=reachablePaths(layer,ant);
      if(!reach)continue;
      const occupants=p=>this.brood.filter(b=>b!==baby &&
        ((!b.carrierId&&b.x===p.x&&b.y===p.y)||
         (b.targetTile?.x===p.x&&b.targetTile?.y===p.y))).length;
      // Eight slots spread across the four real nursery tiles (two per tile).
      const tiles=this.rooms.footprint(room).filter(p=>
        reach.distance(p.x,p.y)>=0 && occupants(p)<2);
      tiles.sort((a,b)=>occupants(a)-occupants(b)||
        reach.distance(a.x,a.y)-reach.distance(b.x,b.y)||a.y-b.y||a.x-b.x);
      if(tiles.length)return {tile:tiles[0],roomId:room.id,kind:'nursery'};
    }
    return null;
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
      baby.pickupBy=null;baby.targetRoomId=null;baby.targetTile=null;baby.targetKind=null;
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
    for(const nurse of nurses.slice(max)) this.releaseNurse(nurse);
  }
  assignNurses() {
    this.releaseExcessNurses();
    if(!this.brood.length || !this.colony.queen.alive) return;
    const shortage=this.nurseSlots-this.nurseCount;
    if(shortage<=0)return;
    let count=0;
    for(const ant of this.colony.workers) {
      if(ant.state!=='idle'||ant.orderId!=null||ant.layer!==UNDERGROUND||this.colony.isForager(ant))continue;
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
        const valid=!!baby && !!baby.targetTile && isWalkable(layer,baby.targetTile.x,baby.targetTile.y) &&
          (baby.targetKind==='temporary'||!!room);
        if(!valid){this.clearBroodCarry(ant);ant.path=[];ant.next=null;ant.motion=0;continue;}
        const arrived=this.nurseWalk(ant,baby.targetTile);
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
        if(baby.pickupBy===ant.id&&baby.targetTile){moving=baby;break;}
        if(baby.roomId&&this.isValidBroodSite(baby))continue;
        const destination=this.nurseryDestination(baby,ant)||
          (!this.isValidBroodSite(baby)?this.temporaryDestination(baby,ant):null);
        if(!destination)continue;
        baby.pickupBy=ant.id;baby.targetTile=destination.tile;
        baby.targetRoomId=destination.roomId;baby.targetKind=destination.kind;
        moving=baby;break;
      }
      if(moving) {
        const origin={x:moving.x,y:moving.y};
        if(this.nurseWalk(ant,origin)){
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
    for(const {baby} of caretakers) {
      const room=baby.roomId?this.rooms?.rooms.find(r=>r.id===baby.roomId):null;
      if(!room||room.status==='ready')baby.care++;
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
    if(!this.colony.queen.alive || this.tickCount%LIFE.layInterval!==0 ||
      this.brood.length>=(this.rooms?.broodCapacity ?? LIFE.broodLimit) || this.totalPopulation>=LIFE.maxPopulation) return;
    const site=this.layingSite();
    if(!site){this.lastEvent='ที่วางไข่ใกล้นางพญาเต็ม — ต้องมีมดพี่เลี้ยงหรือขยายพื้นที่';return;}
    // Queens lay only after foragers have actually deposited protein.
    if(!this.consume('protein')) {this.lastEvent='รอโปรตีนสำหรับนางพญาวางไข่';return;}
    this.brood.push({id:`brood-${this.nextBroodId++}`,stage:'egg',age:0,care:0,waiting:0,
      x:site.x,y:site.y,site:'fresh',roomId:null,carrierId:null,pickupBy:null,targetRoomId:null,targetTile:null,targetKind:null});
    this.lastEvent='นางพญาวางไข่ใหม่แล้ว — รอมดพี่เลี้ยงขนย้าย';
  }
  promote(baby) {
    const q=this.colony.queen;
    const n=this.nextWorkerId++;
    const ant={id:`worker-${n}`,caste:'worker',layer:UNDERGROUND,x:baby.x??q.x,y:baby.y??q.y,
      facing:n%4,next:null,motion:0,path:[],orderId:null,state:'idle'};
    this.colony.workers.push(ant);
    this.adultHealth.set(ant.id,{age:0,hunger:0,thirst:0});
    this.births++;
    this.lastEvent='มดงานตัวใหม่ฟักเป็นตัวเต็มวัย';
  }
  tickBrood(){
    for(const baby of [...this.brood]){
      baby.age++;
      if(baby.stage==='egg' && baby.age>=LIFE.eggTicks){baby.stage='larva';baby.age=0;baby.waiting=0;}
      else if(baby.stage==='larva' && baby.age>=LIFE.larvaTicks && baby.care>=LIFE.requiredCare){
        if(this.consume('protein')){baby.stage='pupa';baby.age=0;baby.waiting=0;}
        else baby.waiting++;
      } else if(baby.stage==='pupa' && baby.age>=LIFE.pupaTicks){
        if(this.colony.queen.alive && this.totalPopulation<=LIFE.maxPopulation) this.promote(baby);
        else this.broodDeaths++;
        this.brood.splice(this.brood.indexOf(baby),1);
      } else if(baby.stage==='larva' && baby.age>=LIFE.larvaTicks){baby.waiting++;}
      if(baby.waiting>LIFE.broodTimeout){
        this.brood.splice(this.brood.indexOf(baby),1);
        this.broodDeaths++;this.lastEvent='ตัวอ่อนขาดการดูแลหรือโปรตีน';
      }
    }
  }
  tick(){
    this.tickCount++;
    this.tickAdults();
    this.layEgg();
    this.assignNurses();
    this.stepNurses();
    this.tickBrood();
    this.releaseExcessNurses();
  }
}
