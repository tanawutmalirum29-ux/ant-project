import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { BASE_CAPACITY, ROOM_CATALOG } from '../src/core/rooms.js';
import { UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';

const run=(g,n)=>{for(let i=0;i<n;i++)g.update(100);};
const fund=(g)=>{g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);g.foraging.inventory.carbs=20;g.foraging.inventory.protein=20;g.foraging.inventory.water=20;};
const place=(g,type='food_store',dx=2,dy=0)=>g.rooms.queue(type,g.colony.queen.x+dx,g.colony.queen.y+dy);
const mass=g=>{
 const source=g.foraging.nodes.reduce((s,n)=>s+n.amount,0);
 const stock=Object.values(g.foraging.inventory).reduce((s,n)=>s+n,0);
 const cargo=g.colony.workers.reduce((s,w)=>s+(w.cargo?.amount||0),0);
 const counted=['consumed','lost'].reduce((s,k)=>s+Object.values(g.lifecycle[k]).reduce((a,b)=>a+b,0),0);
 const materials=['held','spent'].reduce((s,k)=>s+Object.values(g.rooms[k]).reduce((a,b)=>a+b,0),0);
 return source+stock+cargo+counted+materials;
};

test('U5.1 deterministic queen chamber and per-resource starting capacities',()=>{
 const g=new Game('same');
 assert.equal(g.rooms.rooms.length,1);
 assert.equal(g.rooms.getRoom(g.colony.queen.x,g.colony.queen.y).type,'queen');
 assert.deepEqual(g.rooms.capacities(),BASE_CAPACITY);
 assert.ok(g.rooms.readyCount===1);
 assert.equal(place(g).reason,'insufficient-resources');
 const other=new Game('same');assert.deepEqual(g.rooms.rooms,other.rooms.rooms);
});

test('U5.2 only excavated reachable 2×2 with no overlaps, portal blockage or invalid positions',()=>{
 const g=new Game();fund(g);const q=g.colony.queen,l=g.world.layers[UNDERGROUND];
 assert.equal(g.rooms.queue('queen',q.x+2,q.y).reason,'unknown-room');
 assert.equal(g.rooms.queue('food_store',-1,40).reason,'out-of-bounds');
 assert.equal(g.rooms.queue('food_store',q.x,q.y).reason,'overlap');
 assert.equal(g.rooms.queue('food_store',1,1).reason,'needs-excavation');
 const first=place(g);assert.ok(first.ok);
 assert.equal(place(g).reason,'overlap');
 assert.equal(g.rooms.getRoom(q.x+3,q.y+1),first.room);
 assert.equal(first.room.progress,0);
 assert.equal(first.room.status,'planned');
 assert.equal(cellAt(l,q.x+2,q.y),TERRAINS.CHAMBER);
});

test('U5.3 reservation is atomic, can cancel, does not create resources',()=>{
 const g=new Game();fund(g);const initial=mass(g);
 const before={...g.foraging.inventory};
 const r=place(g);assert.ok(r.ok);
 assert.equal(g.foraging.inventory.carbs,before.carbs-4);
 assert.equal(g.foraging.inventory.protein,before.protein-2);
 assert.equal(g.rooms.held.carbs,4);assert.equal(g.rooms.held.protein,2);
 assert.equal(mass(g),initial);
 assert.ok(g.rooms.cancel(r.room.id));
 assert.deepEqual(g.foraging.inventory,before);
 assert.equal(g.rooms.held.carbs,0);
 assert.equal(mass(g),initial);
 assert.equal(g.rooms.cancel(r.room.id),false);
});

test('U5.4 workers build on foot and only completed connected stores increase capacity',()=>{
 const g=new Game();fund(g);const initial=mass(g),r=place(g);
 assert.ok(r.ok);
 run(g,8);assert.equal(g.rooms.readyCount,1);
 assert.ok(r.room.status==='building');
 assert.ok(r.room.progress<ROOM_CATALOG.food_store.ticks);
 run(g,200);assert.equal(r.room.status,'ready');
 assert.equal(r.room.progress,ROOM_CATALOG.food_store.ticks);
 assert.equal(g.rooms.capacityFor('carbs'),BASE_CAPACITY.carbs+40);
 assert.equal(g.rooms.capacityFor('protein'),BASE_CAPACITY.protein+40);
 assert.equal(g.rooms.capacityFor('water'),BASE_CAPACITY.water);
 assert.equal(g.rooms.held.protein,0);
 assert.equal(g.rooms.spent.protein,2);
 assert.equal(g.rooms.completed,1);
 assert.equal(mass(g),initial);
 assert.ok(g.colony.workers.every(w=>isWalkable(g.world.layers[w.layer],w.x,w.y)));
});

test('U5.5 queued construction remains frozen on pause and advances at x4',()=>{
 const g=new Game();fund(g);const r=place(g);run(g,3);
 const snapshot=JSON.stringify({room:r.room,workers:g.colony.workers});
 g.setSpeed(0);run(g,120);
 assert.equal(JSON.stringify({room:r.room,workers:g.colony.workers}),snapshot);
 g.setSpeed(4);run(g,60);
 assert.equal(r.room.status,'ready');
});

test('U5.6 worker death during construction releases stale job and another worker finishes',()=>{
 const g=new Game();fund(g);const r=place(g);run(g,4);
 const worker=g.colony.workers.find(w=>w.id===r.room.workerId);
 assert.ok(worker);
 g.lifecycle.killWorker(worker);
 run(g,4);
 assert.notEqual(r.room.workerId,worker.id);
 run(g,220);
 assert.equal(r.room.status,'ready');
 assert.equal(g.rooms.completed,1);
});

test('U5.7 cancelled in-progress construction refunds original costs, releases builder',()=>{
 const g=new Game();fund(g);const before={...g.foraging.inventory};const r=place(g);
 run(g,12);assert.equal(r.room.status,'building');
 assert.ok(g.rooms.cancel(r.room.id));
 assert.equal(g.rooms.getRoom(r.room.x,r.room.y),null);
 assert.deepEqual(g.foraging.inventory,before);
 assert.ok(g.colony.workers.every(w=>!w.roomId));
});

test('U5.8 topology loss disables finished room, reconnect restores effects',()=>{
 const g=new Game();fund(g);const r=place(g);run(g,180);
 assert.equal(r.room.status,'ready');
 const l=g.world.layers[UNDERGROUND];
 // Direct terrain loss simulates future cave-ins: benefits must not be granted by a disconnected room.
 const x=r.room.x,y=r.room.y,old=cellAt(l,x,y);writeCell(l,x,y,TERRAINS.ROCK);
 g.rooms.updateConnectivity();
 assert.equal(r.room.status,'disabled');assert.equal(g.rooms.capacityFor('carbs'),BASE_CAPACITY.carbs);
 writeCell(l,x,y,old);g.rooms.updateConnectivity();
 assert.equal(r.room.status,'ready');assert.equal(g.rooms.capacityFor('carbs'),BASE_CAPACITY.carbs+40);
});

test('U5.9 constructed water store increases only water; nursery increases brood limit',()=>{
 const g=new Game();fund(g);const w=place(g,'water_store',2,0),n=place(g,'nursery',-4,0);
 assert.ok(w.ok && n.ok);
 run(g,500);
 assert.equal(w.room.status,'ready');assert.equal(n.room.status,'ready');
 assert.equal(g.rooms.capacityFor('water'),BASE_CAPACITY.water+50);
 assert.equal(g.rooms.capacityFor('protein'),BASE_CAPACITY.protein);
 assert.equal(g.rooms.broodCapacity,26);
 assert.equal(g.rooms.getRoom(n.room.x,n.room.y).id,n.room.id);
});

test('U5.10 full warehouse halts deposits without loss, partial deposits resume after space opens',()=>{
 const g=new Game();g.colony.setForageSlots(0);
 const ant=g.colony.workers[0];
 ant.state='forage-wait-storage';ant.cargo={type:'water',amount:3};ant.resourceId=null;
 g.foraging.inventory.water=BASE_CAPACITY.water-1;
 g.foraging.tick();
 assert.equal(g.foraging.inventory.water,BASE_CAPACITY.water);
 assert.equal(ant.cargo.amount,2);
 assert.equal(g.foraging.waitingCount,1);
 g.foraging.tick();assert.equal(ant.cargo.amount,2);
 g.foraging.inventory.water-=2;g.foraging.tick();
 assert.equal(ant.state,'idle');assert.equal(g.foraging.waitingCount,0);
 assert.equal(g.foraging.delivered,3);
});

test('U5.11 warehouse fullness prevents new reservations for full resource types',()=>{
 const g=new Game();g.foraging.inventory.water=BASE_CAPACITY.water;
 g.foraging.inventory.carbs=BASE_CAPACITY.carbs;
 g.foraging.inventory.protein=BASE_CAPACITY.protein;
 assert.equal(g.foraging.pickNode(g.colony.workers[0]),null);
 g.foraging.inventory.carbs--;
 assert.ok(g.foraging.pickNode(g.colony.workers[0]).type==='carbs');
});

test('U5.12 long-run conservation across foraging, adult death, reproduction and constructions',()=>{
 const g=new Game('u5-mass');
 const baseline=mass(g);let built=false;
 for(let i=0;i<4800;i++) {
   if(i===800){
     const r=place(g);
     if(r.ok)built=true;
   }
   g.update(100);
   if(i%43===0){
     assert.equal(mass(g),baseline,`mass mismatch at tick ${i}`);
     assert.ok(g.foraging.nodes.every(n=>n.reserved>=0&&n.reserved<=n.amount));
     assert.ok(Object.values(g.foraging.inventory).every(n=>n>=0));
   }
 }
 assert.ok(g.foraging.delivered>0);
 assert.ok(g.lifecycle.consumed.carbs>0);
 assert.ok(built,'should fund first store from collected resources');
});

test('U5.13 world reset is isolated and clears room materials, orders and capacity',()=>{
 const g=new Game('reset-u5');fund(g);const r=place(g);run(g,200);
 assert.equal(r.room.status,'ready');
 const fresh=new Game('reset-u5');
 assert.equal(fresh.rooms.rooms.length,1);assert.deepEqual(fresh.rooms.capacities(),BASE_CAPACITY);
 assert.equal(fresh.rooms.queuedCount,0);assert.deepEqual(fresh.rooms.spent,{carbs:0,protein:0,water:0});
 assert.equal(fresh.clock.ticks,0);
});

test('U5.14 if construction path changes, worker is released and job never finishes through blocked tiles',()=>{
 const g=new Game();fund(g);const r=place(g);run(g,2);
 const w=g.colony.workers.find(a=>a.roomId===r.room.id);assert.ok(w);
 // No cheating through solid tiles; even a blocked worksite keeps capacity unavailable.
 const l=g.world.layers[UNDERGROUND],pos={x:r.room.x,y:r.room.y},old=cellAt(l,pos.x,pos.y);
 writeCell(l,pos.x,pos.y,TERRAINS.ROCK);run(g,6);
 assert.equal(r.room.status,'planned');assert.equal(g.rooms.capacityFor('carbs'),BASE_CAPACITY.carbs);
 assert.equal(g.rooms.held.carbs,4);
 writeCell(l,pos.x,pos.y,old);run(g,220);
 assert.equal(r.room.status,'ready');
});

test('U5.15 ready rest room attracts free workers; resting slows hunger and releases for new dig jobs',()=>{
 const g=new Game();fund(g);const room=place(g,'rest',2,0);assert.ok(room.ok);
 run(g,220);assert.equal(room.room.status,'ready');
 run(g,60);
 const resting=g.colony.workers.filter(w=>g.rooms.isResting(w));
 assert.ok(resting.length>=1);
 const ant=resting[0];
 const before=g.lifecycle.adultHealth.get(ant.id).hunger;
 run(g,10);
 assert.equal(g.lifecycle.adultHealth.get(ant.id).hunger,before+5);
 // New dig order has higher priority and wakes resting workers.
 const l=g.world.layers[UNDERGROUND];let target=null;
 for(let y=0;y<l.height && !target;y++)for(let x=0;x<l.width && !target;x++){
  if(![TERRAINS.SOIL,TERRAINS.HARD_SOIL].includes(cellAt(l,x,y)))continue;
  if([[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy])=>isWalkable(l,x+dx,y+dy)))target={x,y};
 }
 assert.ok(target);g.colony.queueRectangle(target,target);run(g,8);
 assert.ok(g.colony.workers.some(w=>w.state==='digging'||w.state==='walking'));
 assert.equal(g.colony.workers.filter(w=>w.state==='room-rest').length,0);
});
