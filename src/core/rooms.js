import { UNDERGROUND } from '../world/generate.js';
import { findPath, isWalkable, reachablePaths } from '../world/navigation.js';
import { WORKER_SPEED } from './colony.js';

const RESOURCE_TYPES = ['carbs', 'protein', 'water'];
export const BASE_CAPACITY = Object.freeze({ carbs:24, protein:24, water:24 });
export const ROOM_CATALOG = Object.freeze({
  queen:       Object.freeze({ name:'ห้องนางพญา', width:1, height:1, ticks:0, cost:{}, capacity:{} }),
  nursery:     Object.freeze({ name:'ห้องเลี้ยงตัวอ่อน', width:2, height:2, ticks:65, cost:{carbs:3,protein:2}, capacity:{} }),
  food_store:  Object.freeze({ name:'คลังอาหาร', width:2, height:2, ticks:90, cost:{carbs:4,protein:2}, capacity:{carbs:40,protein:40} }),
  water_store: Object.freeze({ name:'คลังน้ำ', width:2, height:2, ticks:80, cost:{carbs:3,protein:1}, capacity:{water:50} }),
  rest:        Object.freeze({ name:'ห้องพักมดงาน', width:2, height:2, ticks:60, cost:{carbs:2,protein:1}, capacity:{} }),
  guard:       Object.freeze({ name:'ห้องเตรียมป้องกัน', width:2, height:2, ticks:85, cost:{carbs:3,protein:2}, capacity:{} })
});
const key=(x,y)=>`${x},${y}`;
const same=(a,b)=>a.x===b.x&&a.y===b.y;

/** U5 room system. A room order reserves real delivered materials until built or cancelled.
 * Workers walk to the planned footprint; effects only apply to finished connected rooms. */
export class Rooms {
  constructor(world, colony, foraging) {
    this.world=world;this.colony=colony;this.foraging=foraging;
    this.orders=[];this.nextId=1;this.completed=0;this.tickCount=0;this.lifecycle=null;
    this.held={carbs:0,protein:0,water:0};
    this.spent={carbs:0,protein:0,water:0};
    const queen=colony.queen;
    this.rooms=[{id:'room-queen',type:'queen',x:queen.x,y:queen.y,width:1,height:1,
      status:'ready',connected:true,progress:0,workerId:null,cost:{}}];
  }
  footprint(room) {
    const tiles=[];
    for(let y=room.y;y<room.y+room.height;y++)for(let x=room.x;x<room.x+room.width;x++)tiles.push({x,y});
    return tiles;
  }
  getRoom(x,y) { return this.rooms.find(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)||null; }
  get queuedCount() {return this.rooms.filter(r=>r.status==='planned'||r.status==='building').length;}
  get readyCount() {return this.rooms.filter(r=>r.status==='ready').length;}
  get busyCount() {return this.colony.workers.filter(w=>w.state==='room-walk'||w.state==='room-build').length;}
  capacityFor(type) {
    if(!RESOURCE_TYPES.includes(type))throw new RangeError('Unknown resource type');
    return BASE_CAPACITY[type]+this.rooms.reduce((sum,r)=>r.status==='ready'?sum+(ROOM_CATALOG[r.type].capacity[type]||0):sum,0);
  }
  capacities() {return Object.fromEntries(RESOURCE_TYPES.map(type=>[type,this.capacityFor(type)]));}
  get broodCapacity() {return 18+this.rooms.filter(r=>r.type==='nursery'&&r.status==='ready').length*8;}
  /** Validate *all* occupied cells and a path from the living queen chamber. */
  validate(type,x,y) {
    const def=ROOM_CATALOG[type];
    if(!def||type==='queen') return {ok:false,reason:'unknown-room'};
    if(!Number.isInteger(x)||!Number.isInteger(y))return {ok:false,reason:'invalid-position'};
    if(!this.colony.queen.alive)return {ok:false,reason:'disconnected'};
    const l=this.world.layers[UNDERGROUND];
    if(x<1||y<1||x+def.width>=l.width||y+def.height>=l.height)return {ok:false,reason:'out-of-bounds'};
    const paths=reachablePaths(l,this.colony.queen);
    if(!paths)return {ok:false,reason:'disconnected'};
    for(let yy=y;yy<y+def.height;yy++)for(let xx=x;xx<x+def.width;xx++) {
      if(!isWalkable(l,xx,yy))return {ok:false,reason:'needs-excavation'};
      if(this.getRoom(xx,yy))return {ok:false,reason:'overlap'};
      if(paths.distance(xx,yy)<0)return {ok:false,reason:'disconnected'};
      if(this.world.entrances.some(e=>same(e.underground,{x:xx,y:yy})))return {ok:false,reason:'entrance'};
    }
    if(this.queuedCount>=32)return {ok:false,reason:'queue-full'};
    for(const [kind,amount] of Object.entries(def.cost)) {
      if(this.foraging.inventory[kind]<amount)return {ok:false,reason:'insufficient-resources'};
    }
    return {ok:true,reason:'ok'};
  }
  queue(type,x,y) {
    const verdict=this.validate(type,x,y);
    if(!verdict.ok)return {...verdict,room:null};
    const def=ROOM_CATALOG[type];
    for(const [kind,amount] of Object.entries(def.cost)){
      this.foraging.inventory[kind]-=amount;
      this.held[kind]+=amount;
    }
    const room={id:`room-${this.nextId++}`,type,x,y,width:def.width,height:def.height,
      progress:0,status:'planned',connected:true,workerId:null,cost:{...def.cost}};
    this.rooms.push(room);
    return {ok:true,reason:'ok',room};
  }
  release(ant) {
    if(ant.state!=='room-walk'&&ant.state!=='room-build')return;
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;ant.roomId=null;
  }
  cancel(id) {
    const room=this.rooms.find(r=>r.id===id);
    if(!room||!['planned','building'].includes(room.status))return false;
    for(const [kind,amount] of Object.entries(room.cost)){
      this.held[kind]-=amount;
      this.foraging.inventory[kind]+=amount;
    }
    const ant=this.colony.workers.find(w=>w.id===room.workerId);
    if(ant)this.release(ant);
    this.rooms.splice(this.rooms.indexOf(room),1);
    return true;
  }
  reachable(room) {
    if(!this.colony.queen.alive)return false;
    const layer=this.world.layers[UNDERGROUND], paths=reachablePaths(layer,this.colony.queen);
    return !!paths && this.footprint(room).every(p=>isWalkable(layer,p.x,p.y)&&paths.distance(p.x,p.y)>=0);
  }
  updateConnectivity() {
    for(const room of this.rooms) {
      const linked=this.reachable(room);
      room.connected=linked;
      if(room.type==='queen') {room.status=linked?'ready':'disabled';continue;}
      if(room.status==='ready'&&!linked)room.status='disabled';
      else if(room.status==='disabled'&&linked)room.status='ready';
      if(!linked && room.status==='building') {
        const worker=this.colony.workers.find(w=>w.id===room.workerId);
        if(worker)this.release(worker);
        room.workerId=null;room.status='planned';
      }
    }
  }
  pickWorkSite(layer,ant,room) {
    let best=null;
    for(const tile of this.footprint(room)) {
      const path=findPath(layer,ant,tile);
      if(path && (!best||path.length<best.path.length))best={tile,path};
    }
    return best;
  }
  assign() {
    const layer=this.world.layers[UNDERGROUND];
    for(const room of this.rooms) {
      if(room.status!=='planned'||!room.connected)continue;
      let best=null;
      for(const ant of this.colony.workers) {
        if(ant.state!=='idle'||ant.orderId!=null||ant.layer!==UNDERGROUND||this.colony.isForager(ant))continue;
        const site=this.pickWorkSite(layer,ant,room);
        if(site && (!best||site.path.length<best.site.path.length))best={ant,site};
      }
      if(!best)continue;
      room.workerId=best.ant.id;room.status='building';
      best.ant.roomId=room.id;best.ant.path=best.site.path;best.ant.next=null;best.ant.motion=0;
      best.ant.state=best.ant.path.length?'room-walk':'room-build';
    }
  }
  advance(room,ant,layer) {
    if(ant.layer!==UNDERGROUND||!isWalkable(layer,ant.x,ant.y))return false;
    const targetInside=this.footprint(room).some(t=>same(t,ant));
    if(!targetInside) {
      if(!ant.next && ant.path.length===0){
        const site=this.pickWorkSite(layer,ant,room);
        if(!site)return false;
        ant.path=site.path;
      }
      const step=ant.next||ant.path[0];
      if(!step||!isWalkable(layer,step.x,step.y)||Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1)return false;
      if(!ant.next){ant.next=step;ant.motion=0;}
      ant.state='room-walk';ant.motion+=WORKER_SPEED;
      if(ant.motion>=1){ant.x=step.x;ant.y=step.y;ant.next=null;ant.motion=0;ant.path.shift();}
      return true;
    }
    ant.state='room-build';ant.path=[];ant.next=null;ant.motion=0;
    room.progress++;
    if(room.progress>=ROOM_CATALOG[room.type].ticks) {
      for(const [kind,amount] of Object.entries(room.cost)){
        this.held[kind]-=amount;this.spent[kind]+=amount;
      }
      room.status='ready';room.workerId=null;this.completed++;
      this.release(ant);
    }
    return true;
  }
  isResting(ant) {
    return ant.state==='room-rest' && this.rooms.some(room=>room.type==='rest'&&room.status==='ready'&&this.footprint(room).some(p=>same(p,ant)));
  }
  stepRest() {
    const layer=this.world.layers[UNDERGROUND];
    const stations=this.rooms.filter(r=>r.type==='rest'&&r.status==='ready');
    const broodNeedsCare=this.lifecycle?.brood.length && this.lifecycle.nurseCount<this.lifecycle.nurseSlots;
    const constructionWaiting=this.rooms.some(r=>r.status==='planned');
    const priority=this.colony.orders.size>0 || constructionWaiting || broodNeedsCare;
    for(const ant of this.colony.workers) {
      if(ant.state==='room-rest' && (priority||this.colony.isForager(ant)||stations.length===0)){
        ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;ant.restRoomId=null;
      }
      if(ant.state==='idle' && !priority && !this.colony.isForager(ant) && ant.layer===UNDERGROUND && stations.length) {
        const target=stations.map(room=>({room,site:this.pickWorkSite(layer,ant,room)})).filter(v=>v.site).sort((a,b)=>a.site.path.length-b.site.path.length)[0];
        if(target){ant.state='room-rest';ant.restRoomId=target.room.id;ant.path=target.site.path;ant.next=null;ant.motion=0;}
      }
      if(ant.state!=='room-rest')continue;
      const room=stations.find(r=>r.id===ant.restRoomId);
      if(!room){ant.state='idle';ant.restRoomId=null;ant.path=[];ant.next=null;continue;}
      if(this.footprint(room).some(p=>same(p,ant))){ant.path=[];ant.next=null;continue;}
      if(!ant.next&&!ant.path.length){const site=this.pickWorkSite(layer,ant,room);if(!site){ant.state='idle';ant.restRoomId=null;continue;}ant.path=site.path;}
      const step=ant.next||ant.path[0];
      if(!step||!isWalkable(layer,step.x,step.y)||Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1){ant.state='idle';ant.restRoomId=null;ant.next=null;ant.path=[];continue;}
      if(!ant.next){ant.next=step;ant.motion=0;}
      ant.motion+=WORKER_SPEED;
      if(ant.motion>=1){ant.x=step.x;ant.y=step.y;ant.next=null;ant.motion=0;ant.path.shift();}
    }
  }
  tick() {
    this.tickCount++;
    // Connectivity refresh runs every tick: even forced invalid terrain changes cannot grant room benefits.
    this.updateConnectivity();
    const layer=this.world.layers[UNDERGROUND];
    for(const room of this.rooms) {
      if(room.status!=='building')continue;
      const ant=this.colony.workers.find(w=>w.id===room.workerId);
      if(!ant||ant.roomId!==room.id) {room.status='planned';room.workerId=null;continue;}
      if(!this.advance(room,ant,layer)) {
        this.release(ant);room.status='planned';room.workerId=null;
      }
    }
    this.assign();
    this.stepRest();
  }
}
