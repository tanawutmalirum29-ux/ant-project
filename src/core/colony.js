import { TERRAINS, UNDERGROUND, cellAt, writeCell } from '../world/generate.js';
import { DIRECTIONS, isDiggable, isWalkable, reachablePaths } from '../world/navigation.js';

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
      return { id:`worker-${i+1}`, caste:'worker', layer:UNDERGROUND, x,y, facing:i%4, next:null, motion:0, path:[], orderId:null, state:'idle' };
    });
  }
  isForager(ant) { return this.forageSlots > 0 && this.workers.indexOf(ant) >= Math.max(0,this.workers.length-this.forageSlots); }
  setForageSlots(count) { if (!Number.isInteger(count) || count<0 || count>this.workers.length) throw new RangeError('Invalid forager count'); this.forageSlots=count; }
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
    return result;
  }
  cancel(x,y) {
    const k=key(x,y), job=this.orders.get(k);
    if(!job) return false;
    this.orders.delete(k);this.ordersById.delete(job.id);
    for(const ant of this.workers) if(ant.orderId===job.id) this.release(ant);
    return true;
  }
  release(ant) { ant.orderId=null;ant.state='idle';ant.path=[];ant.next=null;ant.motion=0; }
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
    if (ant.state!=='idle' || this.isForager(ant)) return;
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
      ant.state='digging';job.status='digging';job.progress++;
      if(job.progress>=digTicks(job.terrain)) {
        writeCell(layer,job.x,job.y,TERRAINS.TUNNEL);
        this.orders.delete(key(job.x,job.y));this.ordersById.delete(job.id);
        this.completed++;
        this.release(ant);
      }
    }
  }
}
