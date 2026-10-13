import { UNDERGROUND } from '../world/generate.js';
import { findPath, isWalkable } from '../world/navigation.js';
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
  /** Remove stale work assignments, release source reservations, account for lost cargo. */
  killWorker(ant) {
    if(!this.colony.workers.includes(ant)) return false;
    if(ant.orderId!=null) {
      const job=this.colony.ordersById.get(ant.orderId);
      if(job && job.workerId===ant.id) {job.workerId=null;job.status='queued';}
    }
    if(ant.broodCargo) {
      const baby=this.brood.find(b=>b.id===ant.broodCargo);
      if(baby){baby.carrierId=null;baby.x=ant.x;baby.y=ant.y;baby.roomId=null;baby.targetRoomId=null;}
      ant.broodCargo=null;
    }
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
    if(ant.broodCargo){
      const baby=this.brood.find(b=>b.id===ant.broodCargo);
      if(baby){baby.carrierId=null;baby.x=ant.x;baby.y=ant.y;baby.roomId=null;baby.targetRoomId=null;}
      ant.broodCargo=null;
    }
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
  nurseryDestination(baby) {
    if(!this.rooms)return null;
    for(const room of this.rooms.rooms) {
      if(room.type!=='nursery'||room.status!=='ready')continue;
      if(room.id===baby.roomId)return room;
      const occupants=this.brood.filter(b=>b.roomId===room.id||b.targetRoomId===room.id).length;
      if(occupants<8)return room;
    }
    return null;
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
        const room=baby&&this.rooms?.rooms.find(r=>r.id===baby.targetRoomId&&r.status==='ready');
        if(!baby||!room){this.releaseNurse(ant);continue;}
        const goal={x:room.x,y:room.y};
        this.nurseWalk(ant,goal);
        baby.x=ant.x;baby.y=ant.y;
        if(same(ant,goal)) {
          baby.carrierId=null;baby.roomId=room.id;baby.targetRoomId=null;
          ant.broodCargo=null;ant.path=[];ant.next=null;ant.motion=0;
        }
        continue;
      }
      // New eggs start physically in the queen chamber. Nurses collect and
      // carry them to a finished nursery; no instant transfer on room completion.
      const moving=this.brood.find(b=>!b.carrierId&&!b.roomId&&!b.targetRoomId&&this.nurseryDestination(b)&&isWalkable(layer,b.x??queen.x,b.y??queen.y));
      if(moving){
        const room=this.nurseryDestination(moving);
        const origin={x:moving.x??queen.x,y:moving.y??queen.y};
        if(this.nurseWalk(ant,origin)){
          moving.carrierId=ant.id;moving.targetRoomId=room.id;
          ant.broodCargo=moving.id;ant.path=[];ant.next=null;ant.motion=0;
        }
        continue;
      }
      // The nurse must visit the exact tile where a larva lives to give care.
      const larvae=this.brood.filter(b=>b.stage==='larva'&&!b.carrierId&&b.care<LIFE.requiredCare);
      const baby=larvae.find(b=>findPath(layer,ant,{x:b.x??queen.x,y:b.y??queen.y})!==null);
      const destination=baby?{x:baby.x??queen.x,y:baby.y??queen.y}:queen;
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
    // Queens lay only after foragers have actually deposited protein.
    if(!this.consume('protein')) {this.lastEvent='รอโปรตีนสำหรับนางพญาวางไข่';return;}
    this.brood.push({id:`brood-${this.nextBroodId++}`,stage:'egg',age:0,care:0,waiting:0,x:this.colony.queen.x,y:this.colony.queen.y,roomId:null,carrierId:null,targetRoomId:null});
    this.lastEvent='นางพญาวางไข่ใหม่แล้ว';
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
