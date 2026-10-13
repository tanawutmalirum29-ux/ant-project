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
    if(this.foraging.inventory[type]<amount) return false;
    this.foraging.inventory[type]-=amount;
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
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;
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
  stepNurses() {
    const queen=this.colony.queen;
    const layer=this.colony.world.layers[UNDERGROUND];
    const atNursery=[];
    for(const ant of this.colony.workers) {
      if(ant.state!=='nursing') continue;
      if(ant.layer!==UNDERGROUND || !isWalkable(layer,ant.x,ant.y)) {this.releaseNurse(ant);continue;}
      if(same(ant,queen)) {atNursery.push(ant);continue;}
      if(!ant.next && ant.path.length===0) {
        const path=findPath(layer,ant,queen);
        if(path===null){this.releaseNurse(ant);continue;}
        ant.path=path;
      }
      if(!ant.next && ant.path.length){
        const next=ant.path[0];
        if(!isWalkable(layer,next.x,next.y)||Math.abs(next.x-ant.x)+Math.abs(next.y-ant.y)!==1){ant.path=[];continue;}
        ant.next=next;ant.motion=0;
        ant.facing=next.x>ant.x?1:next.x<ant.x?3:next.y>ant.y?2:0;
      }
      if(ant.next){
        ant.motion+=WORKER_SPEED;
        if(ant.motion>=1){ant.x=ant.next.x;ant.y=ant.next.y;ant.path.shift();ant.motion=0;ant.next=null;}
      }
      if(!ant.next && same(ant,queen))atNursery.push(ant);
    }
    // A nurse tends one larva at a time; no invisible global care multiplier.
    for(const ant of atNursery){
      const baby=this.brood.find(b=>b.stage==='larva' && b.care<LIFE.requiredCare);
      if(baby)baby.care++;
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
    this.brood.push({id:`brood-${this.nextBroodId++}`,stage:'egg',age:0,care:0,waiting:0});
    this.lastEvent='นางพญาวางไข่ใหม่แล้ว';
  }
  promote(baby) {
    const q=this.colony.queen;
    const n=this.nextWorkerId++;
    const ant={id:`worker-${n}`,caste:'worker',layer:UNDERGROUND,x:q.x,y:q.y,
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
