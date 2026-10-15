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
/** Bounded rectangular rooms: 2×2 remains a single-tap default, while dragging
 * can choose any shape of at least four connected tiles, up to 8×8.
 * Effects/time/materials derive from occupied area and never appear early. */
export const ROOM_LIMITS = Object.freeze({minArea:4,maxWidth:8,maxHeight:8});
export function roomPlan(type,width=ROOM_CATALOG[type]?.width,height=ROOM_CATALOG[type]?.height) {
  const def=ROOM_CATALOG[type];
  if(!def||type==='queen')return null;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)return null;
  const area=width*height;
  if(area<ROOM_LIMITS.minArea||width>ROOM_LIMITS.maxWidth||height>ROOM_LIMITS.maxHeight)return null;
  const factor=area/(def.width*def.height);
  return {type,width,height,area,cost:Object.fromEntries(Object.entries(def.cost).map(([k,v])=>[k,Math.ceil(v*factor)])),
    ticks:Math.ceil(def.ticks*factor),
    capacity:Object.fromEntries(Object.entries(def.capacity).map(([k,v])=>[k,Math.floor(v*factor)])),
    broodSlots:type==='nursery'?Math.min(area,16):0};
}
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
      status:'ready',connected:true,progress:0,workerId:null,cost:{},stock:{carbs:0,protein:0,water:0}}];
  }
  // Inventory remains the legacy public aggregate for U1-U5 HUD and conservation tests.
  // Each storage room now has physical contents and a delivery position.
  // Reconcile explicit test/debug inventory injections into the starting queen depot;
  // ordinary game code updates both the room ledger and aggregate atomically.
  syncInventory() {
    for(const type of RESOURCE_TYPES) {
      let counted=this.rooms.reduce((n,r)=>n+(r.stock?.[type]||0),0);
      const delta=this.foraging.inventory[type]-counted;
      if(delta>0) this.rooms[0].stock[type]+=delta;
      else if(delta<0) {
        let missing=-delta;
        for(const r of this.rooms) {
          const deduction=Math.min(missing,r.stock?.[type]||0);
          if(deduction){r.stock[type]-=deduction;missing-=deduction;}
          if(!missing)break;
        }
      }
    }
  }
  storageSlots(type) {
    return this.rooms.filter(r=>r.status==='ready' && r.connected &&
      (r.type==='queen'||(type==='water'?r.type==='water_store':r.type==='food_store')))
      .map(r=>{
        // Queued eggs retain space at their original depot for exact refunds.
        const refundable=this.lifecycle?.eggOrders.reduce((n,o)=>
          n+(o.status==='QUEUED'?o.pickups.reduce((v,p)=>
            v+(p.sourceRoomId===r.id&&p.type===type?p.amount:0),0):0),0)??0;
        const cap=r.type==='queen'?BASE_CAPACITY[type]:(r.capacity?.[type]??ROOM_CATALOG[r.type].capacity[type]??0);
        return {room:r,space:Math.max(0,cap-(r.stock?.[type]||0)-refundable)};
      });
  }
  // Storage requires a physical visit; source distance, destination space and
  // accessibility are computed from the worker's ACTUAL underground tile.
  deliveryTarget(type, ant) {
    this.syncInventory();
    const layer=this.world.layers[UNDERGROUND];
    if(ant.layer!==UNDERGROUND)return null;
    const choices=[];
    for(const {room,space} of this.storageSlots(type)) {
      if(space<=0)continue;
      const site=this.pickWorkSite(layer,ant,room);
      if(site)choices.push({room,site,space});
    }
    choices.sort((a,b)=>a.site.path.length-b.site.path.length||a.room.id.localeCompare(b.room.id));
    return choices[0]||null;
  }
  depositAt(ant,type,quantity,target) {
    if(!RESOURCE_TYPES.includes(type)||quantity<=0||ant.layer!==UNDERGROUND)return 0;
    this.syncInventory();
    const room=this.rooms.find(r=>r.id===target);
    if(!room||room.status!=='ready'||!this.footprint(room).some(p=>same(p,ant)))return 0;
    const slot=this.storageSlots(type).find(v=>v.room===room);
    const amount=Math.min(quantity,slot?.space||0);
    if(amount<=0)return 0;
    room.stock[type]+=amount;
    this.foraging.inventory[type]+=amount;
    return amount;
  }
  take(type,amount=1) {
    this.syncInventory();
    if(this.foraging.inventory[type]<amount)return false;
    const accessible=this.storageSlots(type).map(v=>v.room).filter(r=>r.status==='ready');
    if(accessible.reduce((sum,r)=>sum+(r.stock[type]||0),0)<amount)return false;
    let remaining=amount;
    for(const room of accessible) {
      const n=Math.min(remaining,room.stock[type]||0);
      room.stock[type]-=n;remaining-=n;
      if(!remaining)break;
    }
    this.foraging.inventory[type]-=amount;
    return true;
  }
  reserveMaterials(cost) {
    this.syncInventory();
    const pickups=[];
    for(const [type,quantity] of Object.entries(cost)) {
      let remaining=quantity;
      for(const room of this.storageSlots(type).map(v=>v.room)) {
        const amount=Math.min(remaining,room.stock[type]);
        if(amount){room.stock[type]-=amount;this.foraging.inventory[type]-=amount;pickups.push({type,amount,x:room.x,y:room.y,sourceRoomId:room.id,collected:false});remaining-=amount;}
        if(!remaining)break;
      }
      if(remaining)throw new Error('Material reservation after validation failed');
    }
    return pickups;
  }
  // A dropped construction supply is recovered at its real last carrier tile.
  onWorkerDeath(ant) {
    const room=this.rooms.find(r=>r.id===ant.roomId);
    if(!room)return;
    for(const pickup of room.pickups||[])if(pickup.collected) {
      pickup.x=ant.x;pickup.y=ant.y;pickup.collected=false;
    }
    room.workerId=null;room.status='planned';
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
    return BASE_CAPACITY[type]+this.rooms.reduce((sum,r)=>r.status==='ready'?sum+(r.capacity?.[type]??ROOM_CATALOG[r.type].capacity[type]??0):sum,0);
  }
  capacities() {return Object.fromEntries(RESOURCE_TYPES.map(type=>[type,this.capacityFor(type)]));}
  get broodCapacity() {return this.rooms.filter(r=>r.type==='nursery'&&r.status==='ready'&&r.connected).reduce((total,r)=>total+Math.min(r.width*r.height,16),0);}
  /** Validate the entire rectangle; no partial placement/partial payment. */
  validate(type,x,y,width=ROOM_CATALOG[type]?.width,height=ROOM_CATALOG[type]?.height) {
    const def=ROOM_CATALOG[type];
    if(!def||type==='queen')return {ok:false,reason:'unknown-room'};
    if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(width)||!Number.isInteger(height)||
       width<1||height<1)return {ok:false,reason:'invalid-position'};
    if(width>ROOM_LIMITS.maxWidth||height>ROOM_LIMITS.maxHeight)return {ok:false,reason:'size-too-large'};
    if(width*height<ROOM_LIMITS.minArea)return {ok:false,reason:'size-too-small'};
    const plan=roomPlan(type,width,height);
    if(!plan)return {ok:false,reason:'invalid-position'};
    if(!this.colony.queen.alive)return {ok:false,reason:'disconnected'};
    const l=this.world.layers[UNDERGROUND];
    if(x<1||y<1||x+width>=l.width||y+height>=l.height)return {ok:false,reason:'out-of-bounds'};
    const paths=reachablePaths(l,this.colony.queen);
    if(!paths)return {ok:false,reason:'disconnected'};
    for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++) {
      if(!isWalkable(l,xx,yy))return {ok:false,reason:'needs-excavation'};
      if(this.getRoom(xx,yy))return {ok:false,reason:'overlap'};
      if(paths.distance(xx,yy)<0)return {ok:false,reason:'disconnected'};
      if(this.world.entrances.some(e=>same(e.underground,{x:xx,y:yy})))return {ok:false,reason:'entrance'};
    }
    if(this.queuedCount>=32)return {ok:false,reason:'queue-full'};
    this.syncInventory();
    for(const [kind,amount] of Object.entries(plan.cost)) {
      const available=this.storageSlots(kind).reduce((n,v)=>n+v.room.stock[kind],0);
      if(available<amount)return {ok:false,reason:'insufficient-resources'};
    }
    return {ok:true,reason:'ok',plan};
  }
  queue(type,x,y,width=ROOM_CATALOG[type]?.width,height=ROOM_CATALOG[type]?.height) {
    const verdict=this.validate(type,x,y,width,height);
    if(!verdict.ok)return {...verdict,room:null};
    const plan=verdict.plan;
    const pickups=this.reserveMaterials(plan.cost);
    for(const [kind,amount] of Object.entries(plan.cost))this.held[kind]+=amount;
    const room={id:`room-${this.nextId++}`,type,x,y,width,height,
      ticks:plan.ticks,capacity:plan.capacity,broodSlots:plan.broodSlots,
      progress:0,status:'planned',connected:true,workerId:null,
      cost:{...plan.cost},pickups,stock:{carbs:0,protein:0,water:0}};
    this.rooms.push(room);
    return {ok:true,reason:'ok',room};
  }
  release(ant) {
    if(!['room-walk','room-build','room-fetch','room-guard'].includes(ant.state))return;
    ant.state='idle';ant.path=[];ant.next=null;ant.motion=0;ant.roomId=null;
  }
  cancel(id) {
    const room=this.rooms.find(r=>r.id===id);
    if(!room||!['planned','building'].includes(room.status))return false;
    for(const [kind,amount] of Object.entries(room.cost))this.held[kind]-=amount;
    // Undo an unfinished reservation, including any material already carried.
    // Restore to accessible storage; if it became disconnected the queen's
    // reserved-stock ledger retains it until the player reconnects the room.
    for(const pickup of room.pickups||[]) {
      const target=this.rooms.find(r=>r.id===pickup.sourceRoomId)||this.rooms[0];
      target.stock[pickup.type]+=pickup.amount;
      this.foraging.inventory[pickup.type]+=pickup.amount;
    }
    const ant=this.colony.workers.find(w=>w.id===room.workerId);
    if(ant)this.release(ant);
    this.rooms.splice(this.rooms.indexOf(room),1);
    return true;
  }
  reachable(room) {
    // Connectivity is physical; the queen's death stops new egg orders but
    // cannot magically disconnect existing Nursery rooms and laid brood.
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
    const reach=reachablePaths(layer,ant);
    if(!reach)return null;
    let best=null,dist=Infinity;
    for(const tile of this.footprint(room)) {
      const d=reach.distance(tile.x,tile.y);
      if(d>=0&&d<dist){best=tile;dist=d;}
    }
    return best?{tile:best,path:reach.path(best.x,best.y)}:null;
  }
  assign() {
    const layer=this.world.layers[UNDERGROUND];
    for(const room of this.rooms) {
      if(room.status!=='planned'||!room.connected)continue;
      let best=null;
      for(const ant of this.colony.workers) {
        if(ant.state!=='idle'||ant.orderId!=null||ant.layer!==UNDERGROUND||this.colony.isForager(ant)||this.colony.canWork?.(ant,'builder')===false)continue;
        const site=this.pickWorkSite(layer,ant,room);
        if(site && (!best||site.path.length<best.site.path.length))best={ant,site};
      }
      if(!best)continue;
      room.workerId=best.ant.id;room.status='building';
      best.ant.roomId=room.id;best.ant.path=[];best.ant.next=null;best.ant.motion=0;
      best.ant.state=(room.pickups||[]).some(p=>!p.collected)?'room-fetch':(best.site.path.length?'room-walk':'room-build');
      if(best.ant.state!=='room-fetch')best.ant.path=best.site.path;
    }
  }
  advance(room,ant,layer) {
    if(ant.layer!==UNDERGROUND||!isWalkable(layer,ant.x,ant.y))return false;
    // Construction supplies must be collected by the assigned ant from their
    // reserved physical location before building may advance.
    const pickup=(room.pickups||[]).find(p=>!p.collected);
    if(pickup) {
      if(!same(pickup,ant)) {
        if(!ant.next && !ant.path.length) {
          const route=findPath(layer,ant,pickup);
          if(!route)return false;
          ant.path=route;
        }
        const step=ant.next||ant.path[0];
        if(!step||!isWalkable(layer,step.x,step.y)||Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1)return false;
        if(!ant.next){ant.next=step;ant.motion=0;}
        ant.state='room-fetch';ant.motion+=WORKER_SPEED;
        if(ant.motion>=1){ant.x=step.x;ant.y=step.y;ant.next=null;ant.motion=0;ant.path.shift();}
        return true;
      }
      pickup.collected=true;
      ant.path=[];ant.next=null;ant.motion=0;
      ant.state='room-walk';
    }
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
    room.progress+=this.colony.workRate?.(ant,'builder')??1;
    if(room.progress>=(room.ticks??ROOM_CATALOG[room.type].ticks)) {
      for(const [kind,amount] of Object.entries(room.cost)){
        this.held[kind]-=amount;this.spent[kind]+=amount;
      }
      room.status='ready';room.workerId=null;this.completed++;
      this.release(ant);
    }
    return true;
  }
  get roomStock() { this.syncInventory();return this.rooms.map(r=>({id:r.id,stock:{...r.stock}})); }
  isResting(ant) {
    return ant.state==='room-rest' && this.rooms.some(room=>room.type==='rest'&&room.status==='ready'&&this.footprint(room).some(p=>same(p,ant)));
  }
  // U5 guard preparation is a real, low-priority tunnel patrol between the
  // guard staging room and the nest entrance. Fighting remains reserved for U6.
  stepGuard() {
    const layer=this.world.layers[UNDERGROUND];
    const entrance=this.world.entrances[0].underground;
    const stations=this.rooms.filter(r=>r.type==='guard'&&r.status==='ready');
    const busy=this.colony.orders.size>0||this.rooms.some(r=>r.status==='planned'||r.status==='building')||
      (this.lifecycle?.brood.length && this.lifecycle.nurseCount<this.lifecycle.nurseSlots);
    for(const ant of this.colony.workers.filter(a=>a.state==='room-guard')){
      const station=stations.find(r=>r.id===ant.guardRoomId);
      if(!station||busy||this.colony.isForager(ant)||this.colony.canWork?.(ant,'builder')===false){
        this.release(ant);ant.guardRoomId=null;ant.guardLeg=null;continue;
      }
      const goal=ant.guardLeg===1?entrance:{x:station.x,y:station.y};
      if(ant.x===goal.x&&ant.y===goal.y&&!ant.next){ant.guardLeg=1-ant.guardLeg;ant.path=[];continue;}
      if(!ant.next&&!ant.path.length){const route=findPath(layer,ant,goal);if(!route){this.release(ant);ant.guardRoomId=null;continue;}ant.path=route;}
      const step=ant.next||ant.path[0];
      if(!step||!isWalkable(layer,step.x,step.y)||Math.abs(step.x-ant.x)+Math.abs(step.y-ant.y)!==1){
        this.release(ant);ant.guardRoomId=null;continue;
      }
      if(!ant.next){ant.next=step;ant.motion=0;}
      ant.motion+=WORKER_SPEED;
      if(ant.motion>=1){ant.x=step.x;ant.y=step.y;ant.motion=0;ant.next=null;ant.path.shift();}
    }
    if(busy)return;
    for(const station of stations){
      if(this.colony.workers.some(a=>a.state==='room-guard'&&a.guardRoomId===station.id))continue;
      let ant=this.colony.workers.find(a=>a.state==='idle'&&a.layer===UNDERGROUND&&!this.colony.isForager(a)&&this.colony.canWork?.(a,'builder')!==false);
      if(!ant){ant=this.colony.workers.find(a=>a.state==='room-rest'&&a.layer===UNDERGROUND&&!this.colony.isForager(a)&&this.colony.canWork?.(a,'builder')!==false);if(ant)this.releaseRestWorker(ant);}
      if(ant){ant.state='room-guard';ant.guardRoomId=station.id;ant.guardLeg=0;ant.path=[];ant.next=null;ant.motion=0;}
    }
  }
  releaseRestWorker(ant) {
    ant.state='idle';ant.restRoomId=null;ant.path=[];ant.next=null;ant.motion=0;
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
    this.stepGuard();
    this.stepRest();
  }
}
