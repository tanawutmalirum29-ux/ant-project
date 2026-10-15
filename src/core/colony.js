import { TERRAINS, UNDERGROUND, cellAt, writeCell } from '../world/generate.js';
import { DIRECTIONS, isDiggable, isWalkable, reachablePaths, findExcavationRoute } from '../world/navigation.js';

export const WORKER_COUNT = 5;
export const MAX_ORDERS = 600;
export const WORKER_SPEED = 0.34; // tiles per simulation tick
export function digTicks(terrain) { return terrain === TERRAINS.SOIL ? 12 : terrain === TERRAINS.HARD_SOIL ? 30 : Infinity; }
const key = (x,y) => `${x},${y}`;

export class Colony {
  constructor(world) {
    this.world = world;
    this.orders = new Map();
    this.ordersById = new Map();
    this.completed = 0;
    this.nextOrder = 1;
    this.tickCount = 0;
    this.accessBlocked = false;
    this.forageSlots = 2;
    const layer = world.layers[UNDERGROUND];
    const entrance = world.entrances[0].underground;
    const center = { x: entrance.x, y: entrance.y + 9 };
    if (!isWalkable(layer, center.x, center.y)) throw new Error('Spawn chamber is blocked');
    this.queen = { id:'queen-1', caste:'queen', layer:UNDERGROUND, x:center.x, y:center.y, facing:0, alive:true };
    const offsets = [[-2,0],[-1,-1],[0,1],[1,-1],[2,0]];
    this.workers = offsets.map(([dx,dy],i) => {
      const x = center.x+dx, y=center.y+dy;
      if (!isWalkable(layer,x,y)) throw new Error('Worker spawned inside a wall');
      return { id:`worker-${i+1}`, caste:'worker',profession:'starter',level:1, layer:UNDERGROUND, x,y, facing:i%4, next:null, motion:0, path:[], orderId:null, state:'idle' };
    });
  }
  isForager(ant) {
    if(!this.workers.includes(ant)||ant.combatRole==='soldier'||ant.profession==='soldier')return false;
    if(ant.profession==='forager')return true;
    if(this.workers.some(a=>a.profession==='forager'))return false;
    if(ant.profession==='starter'||!ant.profession){
      const general=this.workers.filter(a=>!a.combatRole&&(!a.profession||a.profession==='starter'));
      return this.forageSlots>0&&general.indexOf(ant)>=Math.max(0,general.length-this.forageSlots);
    }
    // In a colony with no forage specialists or generalists, preserve a
    // single emergency food courier rather than reassign every craft worker.
    const civilians=this.workers.filter(a=>a.profession!=='soldier'&&!a.combatRole);
    return !this.workers.some(a=>!a.profession||a.profession==='starter')&&civilians[0]===ant;
  }
  canWork(ant,job){
    if(!this.workers.includes(ant))return false;
    if(job==='soldier')return ant.profession==='soldier';
    if(ant.profession==='soldier'||ant.combatRole==='soldier')return false;
    if(!ant.profession||ant.profession==='starter')return true;
    if(ant.profession===job)return true;
    // Last-resort civilian fallback only if no permanent specialist or starter
    // remains in the colony for this function.
    return !this.workers.some(a=>a.profession===job||a.profession==='starter'||!a.profession);
  }
  workRate(ant,job){
    const level=Math.max(1,Math.min(5,ant.level||1));
    const main=ant.profession===job;
    if(!main&&ant.profession!=='starter')return 0.5;
    if(job==='miner')return 1+0.2*(level-1);
    if(job==='builder')return 1+0.25*(level-1);
    return 1;
  }
  setForageSlots(count,fromPolicy=false) { if (!Number.isInteger(count) || count<0 || count>this.workers.length) throw new RangeError('Invalid forager count'); if(!fromPolicy)this.workforce?.disableAuto('forage'); this.forageSlots=count; }
  get population() { return this.workers.length + (this.queen.alive ? 1 : 0); }
  get pendingCount() { return this.orders.size; }
  get busyCount() { return this.workers.filter(a=>a.orderId!=null).length; }
  getOrder(x,y) { return this.orders.get(key(x,y)) || null; }
  queueRectangle(a,b) {
    const layer=this.world.layers[UNDERGROUND];
    const x0=Math.max(0,Math.min(a.x,b.x)), x1=Math.min(layer.width-1,Math.max(a.x,b.x));
    const y0=Math.max(0,Math.min(a.y,b.y)), y1=Math.min(layer.height-1,Math.max(a.y,b.y));
    const result={ added:0, existing:0, blocked:0, limit:false };
    if(x0>x1||y0>y1) return result;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
      if(!isDiggable(layer,x,y)) {result.blocked++;continue;}
      const k=key(x,y);
      if(this.orders.has(k)) {result.existing++;continue;}
      if(this.orders.size>=MAX_ORDERS){result.limit=true;return result;}
      const job={id:this.nextOrder++,x,y,terrain:cellAt(layer,x,y),progress:0,status:'queued',workerId:null};
      this.orders.set(k,job);this.ordersById.set(job.id,job);
      result.added++;
    }
    if(result.added)this.accessBlocked=false;
    return result;
  }
  rectangleBounds(a,b){
    const layer=this.world.layers[UNDERGROUND];
    return {x0:Math.max(0,Math.min(a.x,b.x)),x1:Math.min(layer.width-1,Math.max(a.x,b.x)),
      y0:Math.max(0,Math.min(a.y,b.y)),y1:Math.min(layer.height-1,Math.max(a.y,b.y))};
  }
  inspectRectangle(a,b){
    const layer=this.world.layers[UNDERGROUND],bounds=this.rectangleBounds(a,b);
    const result={existing:0,available:0,blocked:0};
    for(let y=bounds.y0;y<=bounds.y1;y++)for(let x=bounds.x0;x<=bounds.x1;x++){
      if(this.getOrder(x,y))result.existing++;
      else if(isDiggable(layer,x,y))result.available++;
      else result.blocked++;
    }
    return result;
  }
  removeOrder(x,y){
    const k=key(x,y),job=this.orders.get(k);
    if(!job)return false;
    this.orders.delete(k);this.ordersById.delete(job.id);
    for(const ant of this.workers)if(ant.orderId===job.id)this.release(ant);
    return true;
  }
  resetAccess(){
    for(const job of [...this.orders.values()])if(job.auto)this.removeOrder(job.x,job.y);
    this.accessBlocked=false;
  }
  cancel(x,y){
    const job=this.getOrder(x,y);
    if(!job)return false;
    this.removeOrder(x,y);
    if(!job.auto)this.resetAccess();
    return true;
  }
  cancelRectangle(a,b){
    const {x0,x1,y0,y1}=this.rectangleBounds(a,b);
    let cancelled=0;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
      if(this.removeOrder(x,y))cancelled++;
    if(cancelled)this.resetAccess();
    return {cancelled};
  }
  // Plan ONE extra frontier job at a time. New tunnels unlock the next step;
  // no ant is ever assigned through uncleared soil or a rock tile.
  queueAccessStep(){
    const layer=this.world.layers[UNDERGROUND];
    if(this.orders.size>=MAX_ORDERS||[...this.orders.values()].some(job=>job.auto))return false;
    const targets=[...this.orders.values()].filter(job=>!job.auto);
    const workers=this.workers.filter(ant=>ant.layer===UNDERGROUND&&!this.isForager(ant)&&ant.state==='idle'&&this.canWork(ant,'miner'));
    if(!targets.length||!workers.length)return false;
    const route=findExcavationRoute(layer,workers,targets);
    if(!route){this.accessBlocked=true;return false;}
    const next=route.path.find(p=>isDiggable(layer,p.x,p.y));
    if(!next||this.getOrder(next.x,next.y))return false;
    const job={id:this.nextOrder++,x:next.x,y:next.y,terrain:cellAt(layer,next.x,next.y),
      progress:0,status:'queued',workerId:null,auto:true};
    this.orders.set(key(next.x,next.y),job);this.ordersById.set(job.id,job);
    this.accessBlocked=false;
    return true;
  }
  release(ant) { ant.orderId=null;ant.state='idle';ant.path=[];ant.next=null;ant.motion=0; }

  // Ambient walks are optional presentation activity, not jobs. Any real task
  // may cancel an in-progress stroll without changing the unit's grid tile.
  stopAmbient(ant) {
    if(!ant.ambientActive)return;
    ant.ambientActive=false;ant.ambientSteps=0;ant.ambientWait=0;
    ant.next=null;ant.path=[];ant.motion=0;
  }
  tickAmbient(combat=null) {
    const layer=this.world.layers[UNDERGROUND],queen=this.queen;
    if(!queen.alive)return;
    // Patrols must not dodge or distract invaders: nest alarm cancels leisure
    // motion, leaving real defense/combat systems responsible for responses.
    const intruderAlert=combat?.enemies.some(e=>e.layer===UNDERGROUND);
    for(const ant of this.workers) {
      if(intruderAlert){
        if(ant.state==='idle')this.stopAmbient(ant);
        else {ant.ambientActive=false;ant.ambientSteps=0;}
        continue;
      }
      // This runs AFTER every real work scheduler in Game.systems.
      if(ant.state!=='idle'||ant.orderId!=null||ant.layer!==UNDERGROUND||
         ant.combatRole||ant.cargo?.amount||ant.broodCargo){
        ant.ambientActive=false;ant.ambientSteps=0;continue;
      }
      if(ant.next && !ant.ambientActive)continue; // An unrelated system owns the step.
      const id=Number(String(ant.id).split('-').at(-1))||0;
      if(ant.ambientActive && ant.next){
        const step=ant.next;
        if(Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1||
           !isWalkable(layer,ant.x,ant.y)||!isWalkable(layer,step.x,step.y)){
          this.stopAmbient(ant);ant.ambientWait=12;continue;
        }
        ant.motion+=WORKER_SPEED*.85;
        if(ant.motion>=1){
          ant.x=step.x;ant.y=step.y;ant.next=null;ant.motion=0;
          ant.ambientSteps--;
          if(ant.ambientSteps<=0){
            ant.ambientActive=false;
            ant.ambientWait=12+(this.tickCount+id*7)%21;
          }
        }
        continue;
      }
      if(ant.ambientWait==null)ant.ambientWait=3+(id*7)%15;
      if(ant.ambientWait>0){ant.ambientWait--;continue;}
      if(!ant.ambientActive){ant.ambientActive=true;ant.ambientSteps=2+(this.tickCount+id)%3;}
      // No pathfinding for cosmetic local movement: one cardinal walkable step,
      // bounded near the queen and replayable without consuming gameplay RNG.
      const start=(this.tickCount+id*11+ant.x*3+ant.y*5)%DIRECTIONS.length;
      const nearQueen=Math.abs(ant.x-queen.x)+Math.abs(ant.y-queen.y);
      let chosen=null;
      for(let i=0;i<DIRECTIONS.length;i++){
        const [dx,dy]=DIRECTIONS[(start+i)%DIRECTIONS.length],x=ant.x+dx,y=ant.y+dy;
        const nextDistance=Math.abs(x-queen.x)+Math.abs(y-queen.y);
        if(isWalkable(layer,x,y) && (nearQueen>10?nextDistance<nearQueen:nextDistance<=10)){
          chosen={x,y};break;
        }
      }
      if(!chosen){
        ant.ambientActive=false;ant.ambientSteps=0;ant.ambientWait=20;continue;
      }
      ant.next=chosen;ant.motion=0;
      ant.facing=chosen.x>ant.x?1:chosen.x<ant.x?3:chosen.y>ant.y?2:0;
    }
  }
  // Only the current reservation holder may return a dig job to the queue.
  // Never erase another worker's valid assignment when clearing a stale ant.
  abandonOrder(ant, job) {
    if(job && job.workerId===ant.id) {
      job.workerId=null;
      job.status='queued';
    }
    this.release(ant);
  }
  chooseOrder(ant) {
    if (ant.state!=='idle' || this.isForager(ant)||!this.canWork(ant,'miner')) return;
    const layer=this.world.layers[UNDERGROUND], reach=reachablePaths(layer,ant);
    if(!reach) return;
    let best=null;
    for(const job of this.orders.values()) {
      if(job.workerId!=null || !isDiggable(layer,job.x,job.y)) continue;
      for(const [dx,dy] of DIRECTIONS) {
        const x=job.x+dx,y=job.y+dy, distance=reach.distance(x,y);
        if(distance<0) continue;
        // Short paths first, with stable queued-order and adjacency tie breakers.
        if(!best || distance<best.distance || (distance===best.distance && job.id<best.job.id)) {
          best={job,x,y,distance};
        }
      }
    }
    if(!best) return;
    best.job.workerId=ant.id;best.job.status='assigned';
    this.stopAmbient(ant);
    ant.orderId=best.job.id;ant.path=reach.path(best.x,best.y);
    ant.state=ant.path.length?'walking':'digging';
  }
  tick() {
    this.tickCount++;
    const layer=this.world.layers[UNDERGROUND];
    for(const ant of this.workers) {
      if(ant.state.startsWith('forage-')) continue;
      if(ant.orderId==null) {
        // Retry unreachable work periodically; completed tunnels make new work accessible.
        if(this.orders.size && (this.tickCount%5===0 || this.tickCount===1)) this.chooseOrder(ant);
        if(ant.orderId==null) continue;
      }
      const job=this.ordersById.get(ant.orderId);
      if(!job || job.workerId!==ant.id || !isDiggable(layer,job.x,job.y)) {this.abandonOrder(ant,job);continue;}
      if(ant.path.length || ant.next) {
        ant.state='walking';
        if(!ant.next) {
          const next=ant.path[0];
          if(!next || !isWalkable(layer,next.x,next.y) || Math.abs(next.x-ant.x)+Math.abs(next.y-ant.y)!==1) {
            this.abandonOrder(ant,job);continue;
          }
          ant.next=next;ant.motion=0;
          ant.facing=next.x>ant.x?1:next.x<ant.x?3:next.y>ant.y?2:0;
        }
        // A previously selected step can become blocked while motion accumulates.
        // Revalidate before advancing motion AND before the synchronous position commit.
        // The first path cell must still be this cardinal, walkable pending step.
        const step=ant.next, pathStep=ant.path[0];
        if(!step || !pathStep || step.x!==pathStep.x || step.y!==pathStep.y ||
           Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1 ||
           !isWalkable(layer,ant.x,ant.y) || !isWalkable(layer,step.x,step.y)) {
          this.abandonOrder(ant,job);continue;
        }
        ant.motion+=WORKER_SPEED;
        if(ant.motion>=1) {
          ant.x=ant.next.x;ant.y=ant.next.y;ant.path.shift();ant.motion=0;ant.next=null;
        }
        continue;
      }
      const distance=Math.abs(ant.x-job.x)+Math.abs(ant.y-job.y);
      if(distance!==1 || !isWalkable(layer,ant.x,ant.y)) {
        this.abandonOrder(ant,job);continue;
      }
      ant.state='digging';job.status='digging';job.progress+=this.workRate(ant,'miner');
      if(job.progress>=digTicks(job.terrain)) {
        writeCell(layer,job.x,job.y,TERRAINS.TUNNEL);
        this.orders.delete(key(job.x,job.y));this.ordersById.delete(job.id);
        this.completed++;
        this.release(ant);
      }
    }
    if(this.orders.size && !this.busyCount && this.tickCount%5===1)this.queueAccessStep();
  }
}
