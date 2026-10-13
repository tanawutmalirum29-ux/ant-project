import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { ROOM_CATALOG, ROOM_LIMITS, roomPlan, BASE_CAPACITY } from '../src/core/rooms.js';
import { UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';

function setup(seed='variable-rooms'){
 const g=new Game(seed);
 g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
 Object.assign(g.foraging.inventory,{carbs:24,protein:24,water:24});
 return g;
}
const run=(g,n)=>{for(let i=0;i<n;i++)g.update(100)};
const mass=g=>g.foraging.nodes.reduce((a,b)=>a+b.amount,0)+
 Object.values(g.foraging.inventory).reduce((a,b)=>a+b,0)+
 g.colony.workers.reduce((a,b)=>a+(b.cargo?.amount||0),0)+
 ['spent','held'].reduce((a,k)=>a+Object.values(g.rooms[k]).reduce((x,y)=>x+y,0),0)+
 ['consumed','lost'].reduce((a,k)=>a+Object.values(g.lifecycle[k]).reduce((x,y)=>x+y,0),0);

test('RESIZE-01 area-scaled cost, ticks, storage and brood capacity preserve 2x2 legacy semantics',()=>{
 const def=ROOM_CATALOG.food_store,small=roomPlan('food_store');
 assert.deepEqual(small.cost,def.cost);assert.equal(small.ticks,90);
 assert.equal(small.capacity.carbs,40);assert.equal(small.area,4);
 const large=roomPlan('food_store',2,3);
 assert.deepEqual(large.cost,{carbs:6,protein:3});
 assert.equal(large.ticks,135);assert.equal(large.capacity.carbs,60);
 assert.equal(large.capacity.protein,60);
 assert.equal(roomPlan('nursery',4,3).broodSlots,24);
 assert.equal(roomPlan('water_store',3,4).capacity.water,150);
 assert.equal(roomPlan('guard',1,4).ticks,85);
 assert.equal(roomPlan('rest',1,1),null);
 assert.equal(roomPlan('food_store',9,2),null);
 assert.equal(ROOM_LIMITS.maxWidth,8);
});
test('RESIZE-02 arbitrary 2x3 rectangle queues exact footprint and completes on foot at scaled time',()=>{
 const g=setup('rect-2x3'),q=g.colony.queen;
 const x=q.x-4,y=q.y-1;
 assert.equal(g.rooms.validate('food_store',x,y,2,3).ok,true);
 const initial=mass(g),before={...g.foraging.inventory};
 const v=g.rooms.queue('food_store',x,y,2,3);
 assert.ok(v.ok);
 assert.equal(v.room.width,2);assert.equal(v.room.height,3);
 assert.equal(v.room.ticks,135);
 assert.equal(g.rooms.held.carbs,6);
 assert.equal(g.rooms.held.protein,3);
 assert.equal(g.foraging.inventory.carbs,before.carbs-6);
 assert.equal(g.foraging.inventory.protein,before.protein-3);
 for(let yy=y;yy<y+3;yy++)for(let xx=x;xx<x+2;xx++)
   assert.strictEqual(g.rooms.getRoom(xx,yy),v.room);
 assert.equal(g.rooms.getRoom(x+2,y),null);
 assert.equal(g.rooms.capacityFor('carbs'),24,'planned area grants no capacity');
 run(g,290);
 assert.equal(v.room.status,'ready');assert.equal(v.room.progress,135);
 assert.equal(g.rooms.capacityFor('carbs'),BASE_CAPACITY.carbs+60);
 assert.equal(g.rooms.capacityFor('protein'),BASE_CAPACITY.protein+60);
 assert.equal(mass(g),initial);
});
test('RESIZE-03 full rectangle validates overlap, excavation, connected reachability and bounds',()=>{
 const g=setup('room-validation'),q=g.colony.queen,l=g.world.layers[UNDERGROUND];
 const x=q.x-4,y=q.y-1;
 const invalid=[
   [x,y,1,1,'size-too-small'],
   [x,y,9,4,'size-too-large'],
   [-3,y,2,3,'out-of-bounds'],
   [x,y,2,-1,'invalid-position'],
   [x+.2,y,2,3,'invalid-position'],
   [1,1,2,3,'needs-excavation']
 ];
 for(const [xx,yy,w,h,reason] of invalid)
   assert.equal(g.rooms.queue('food_store',xx,yy,w,h).reason,reason,reason);
 assert.ok(g.rooms.queue('food_store',x,y,2,3).ok);
 assert.equal(g.rooms.validate('nursery',x+1,y+2,2,2).reason,'overlap');
 const clear={x:q.x+2,y:q.y},old=cellAt(l,clear.x,clear.y);
 writeCell(l,clear.x,clear.y,TERRAINS.ROCK);
 assert.equal(g.rooms.validate('food_store',q.x+1,q.y,2,2).reason,'needs-excavation');
 writeCell(l,clear.x,clear.y,old);
 assert.equal(g.rooms.rooms.length,2,'invalid rectangles must not produce partial rooms');
});
test('RESIZE-04 large nurse floor capacity and no stacking more than two brood per tile',()=>{
 const g=setup('nursery-large-floor'),q=g.colony.queen;
 const a=g.rooms.queue('nursery',q.x-4,q.y-1,2,3);
 assert.equal(a.ok,true);
 assert.equal(a.room.broodSlots,12);
 run(g,260);
 assert.equal(a.room.status,'ready');
 assert.equal(g.rooms.broodCapacity,30);
 g.lifecycle.setNurseSlots(1);
 run(g,420);
 const brood=g.lifecycle.brood.filter(b=>b.roomId===a.room.id);
 assert.ok(brood.length>0);
 const counts=new Map;
 for(const b of brood) {
   assert.ok(b.x>=a.room.x&&b.x<a.room.x+2&&b.y>=a.room.y&&b.y<a.room.y+3);
   const id=b.x+','+b.y;counts.set(id,(counts.get(id)||0)+1);
 }
 assert.ok([...counts.values()].every(n=>n<=2));
});
test('RESIZE-05 cancel and reconnect large rooms keep materials conserved and effects gated',()=>{
 const g=setup('large-cancel'),q=g.colony.queen,x=q.x-4,y=q.y-1;
 const initial=mass(g),before={...g.foraging.inventory};
 const result=g.rooms.queue('water_store',x,y,2,3);
 assert.ok(result.ok);
 assert.equal(g.rooms.cancel(result.room.id),true);
 assert.deepEqual(g.foraging.inventory,before);
 assert.equal(mass(g),initial);
 const again=g.rooms.queue('water_store',x,y,2,3);
 run(g,260);
 assert.equal(again.room.status,'ready');
 assert.equal(g.rooms.capacityFor('water'),24+75);
 const l=g.world.layers[UNDERGROUND],old=cellAt(l,x,y);
 writeCell(l,x,y,TERRAINS.ROCK);g.rooms.updateConnectivity();
 assert.equal(again.room.status,'disabled');
 assert.equal(g.rooms.capacityFor('water'),24);
 writeCell(l,x,y,old);g.rooms.updateConnectivity();
 assert.equal(g.rooms.capacityFor('water'),99);
 assert.equal(mass(g),initial);
});
test('RESIZE-06 narrow 1x4 is supported; size is not constrained to fixed 2x2 shapes',()=>{
 const g=setup('narrow-shapes'),q=g.colony.queen;
 // Along the central connected queen chamber, without touching queen herself.
 const v=g.rooms.validate('rest',q.x+2,q.y-1,1,4);
 assert.ok(v.ok,JSON.stringify(v));
 const room=g.rooms.queue('rest',q.x+2,q.y-1,1,4).room;
 assert.equal(room.width,1);assert.equal(room.height,4);
 run(g,220);assert.equal(room.status,'ready');
});
