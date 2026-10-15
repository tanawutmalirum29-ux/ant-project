import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { LIFE } from '../src/core/lifecycle.js';
import { UNDERGROUND, TERRAINS, writeCell, cellAt } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';

const run=(g,n)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1)};
const key=b=>b.x+','+b.y;
function fixture(seed='brood-placement',existing=true) {
 const g=new Game(seed);g.colony.setForageSlots(0);
 Object.assign(g.foraging.inventory,{carbs:22,protein:22,water:22});
 if(!existing)return {g,room:null};
 const q=g.colony.queen;
 const room={id:'brood-test-nursery',type:'nursery',x:q.x-4,y:q.y,width:2,height:2,
   status:'ready',connected:true,progress:65,ticks:65,workerId:null,broodSlots:4,
   cost:{carbs:3,protein:2},capacity:{},stock:{carbs:0,protein:0,water:0}};
 g.rooms.rooms.push(room);g.rooms.updateConnectivity();assert.equal(room.status,'ready');
 return {g,room};
}
const queue=(g,room,job='miner',lv=1)=>{
 const r=g.lifecycle.queueEgg(room.id,job,lv);assert.equal(r.ok,true,r.reason);return r.order;
};
const mass=g=>g.foraging.nodes.reduce((s,n)=>s+n.amount,0)+
 Object.values(g.foraging.inventory).reduce((s,n)=>s+n,0)+
 g.colony.workers.reduce((s,w)=>s+(w.cargo?.amount||0),0)+
 ['consumed','lost','heldEgg','eggSpent'].reduce((s,k)=>
   s+Object.values(g.lifecycle[k]).reduce((n,v)=>n+v,0),0)+
 ['held','spent'].reduce((s,k)=>s+Object.values(g.rooms[k]).reduce((n,v)=>n+v,0),0)-
 Object.values(g.ecology.regenerated).reduce((s,n)=>s+n,0);

test('BROOD-01 | no free queen eggs without a ready Nursery and player order',()=>{
 const {g}=fixture('no-nursery-no-nurses',false);
 g.lifecycle.setNurseSlots(0);
 run(g,LIFE.layInterval*3);
 assert.equal(g.lifecycle.brood.length,0);
 assert.equal(g.lifecycle.eggOrders.length,0);
 assert.equal(g.lifecycle.eggSpent.protein,0);
 assert.equal(g.rooms.rooms.length,1);
});
test('BROOD-02 | physical nurse transport follows actual ant tiles to reserved Nursery',()=>{
 const {g,room}=fixture('brood-physical-transport');queue(g,room);
 let carrying=false,moved=false,delivered=false;
 for(let i=0;i<620;i++){
   const before=new Map(g.colony.workers.map(a=>[a.id,{x:a.x,y:a.y}]));
   run(g,1);
   for(const ant of g.colony.workers.filter(a=>a.broodCargo)){
     const baby=g.lifecycle.brood.find(b=>b.id===ant.broodCargo);
     assert.ok(baby);
     assert.equal(baby.carrierId,ant.id);
     assert.deepEqual({x:baby.x,y:baby.y},{x:ant.x,y:ant.y});
     const prior=before.get(ant.id);
     assert.ok(Math.abs(ant.x-prior.x)+Math.abs(ant.y-prior.y)<=1);
     carrying=true;
     if(key(ant)!==key(prior))moved=true;
   }
   if(g.lifecycle.brood.some(b=>b.roomId===room.id)){delivered=true;break;}
 }
 assert.ok(carrying);assert.ok(moved);assert.ok(delivered);
});
test('BROOD-03 | built Nursery accepts only new explicit orders and physical delivery',()=>{
 const {g}=fixture('brood-build-room',false);
 const q=g.colony.queen;
 const build=g.rooms.queue('nursery',q.x-4,q.y);
 assert.ok(build.ok);
 for(let i=0;i<380&&build.room.status!=='ready';i++)run(g,1);
 assert.equal(build.room.status,'ready');
 assert.equal(g.lifecycle.brood.length,0);
 const order=queue(g,build.room,'builder',1);
 let delivered=false;
 for(let i=0;i<650;i++){
   run(g,1);
   const baby=g.lifecycle.brood.find(b=>b.orderId===order.id);
   if(baby?.roomId===build.room.id){delivered=true;break;}
 }
 assert.ok(delivered);
});
test('BROOD-04 | multiple nurses and eggs keep unique destinations and cargo IDs',()=>{
 const {g,room}=fixture('two-independent-nurses');
 g.lifecycle.setNurseSlots(2);queue(g,room);queue(g,room,'nurse',2);
 let seen=0;
 for(let i=0;i<710;i++){
   run(g,1);
   const babies=g.lifecycle.brood;
   for(const ant of g.colony.workers.filter(a=>a.broodCargo)){
     assert.equal(babies.filter(b=>b.carrierId===ant.id).length,1);
     seen++;
   }
   const targeted=babies.filter(b=>b.targetTile);
   assert.equal(new Set(targeted.map(b=>key(b.targetTile))).size,targeted.length);
   assert.equal(new Set(babies.map(b=>b.id)).size,babies.length);
   assert.equal(new Set(g.lifecycle.eggOrders.map(o=>key(o.slot))).size,g.lifecycle.eggOrders.length);
 }
 assert.ok(seen>0);
});
test('BROOD-05 | nurse death drops egg at exact carrier position, preserving reservation',()=>{
 const {g,room}=fixture('brood-drop-on-death');const order=queue(g,room);
 let carrier=null;
 for(let i=0;i<360&&!carrier;i++){
   run(g,1);carrier=g.colony.workers.find(a=>a.broodCargo);
 }
 assert.ok(carrier);
 const baby=g.lifecycle.brood.find(b=>b.carrierId===carrier.id);
 const last={x:carrier.x,y:carrier.y},id=baby.id,count=g.lifecycle.brood.length;
 assert.equal(g.lifecycle.killWorker(carrier),true);
 assert.equal(g.lifecycle.brood.length,count);
 assert.strictEqual(g.lifecycle.brood.find(b=>b.id===id),baby);
 assert.deepEqual({x:baby.x,y:baby.y},last);
 assert.equal(baby.carrierId,null);
 assert.equal(baby.pickupBy,null);
 assert.equal(g.lifecycle.eggOrders[0].id,order.id);
 assert.equal(g.lifecycle.nurseryStatus(room.id).used,1);
});
test('BROOD-06 | pause freezes brood positions, age and carrier motion',()=>{
 const {g,room}=fixture('brood-freeze');queue(g,room);
 run(g,210);
 const before=JSON.stringify({brood:g.lifecycle.brood,orders:g.lifecycle.eggOrders,ants:g.colony.workers});
 g.setSpeed(0);
 for(let i=0;i<120;i++)assert.equal(g.update(100),0);
 assert.equal(JSON.stringify({brood:g.lifecycle.brood,orders:g.lifecycle.eggOrders,ants:g.colony.workers}),before);
});
test('BROOD-07 | blocked queen chamber delays an already-paid order without extra debit',()=>{
 const {g,room}=fixture('brood-laying-blocked');queue(g,room);
 const q=g.colony.queen,layer=g.world.layers[UNDERGROUND],saved=[];
 for(let y=q.y-3;y<=q.y+3;y++)for(let x=q.x-3;x<=q.x+3;x++){
   if(x===q.x&&y===q.y)continue;
   if(Math.abs(x-q.x)+Math.abs(y-q.y)>3)continue;
   saved.push([x,y,cellAt(layer,x,y)]);
   writeCell(layer,x,y,TERRAINS.ROCK);
 }
 g.lifecycle.tickCount=LIFE.layInterval;
 const held={...g.lifecycle.heldEgg},stock={...g.foraging.inventory};
 g.lifecycle.layEgg();
 assert.equal(g.lifecycle.brood.length,0);
 assert.deepEqual(g.lifecycle.heldEgg,held);
 assert.deepEqual(g.foraging.inventory,stock);
 for(const [x,y,t] of saved)writeCell(layer,x,y,t);
 g.lifecycle.layEgg();
 assert.equal(g.lifecycle.brood.length,1);
 assert.equal(g.lifecycle.eggSpent.protein,1);
 assert.equal(g.lifecycle.eggOrders.length,1);
});
test('BROOD-08 | stock conservation includes held eggs, laid eggs and real care feeding',()=>{
 const {g,room}=fixture('brood-resource-preservation');
 g.lifecycle.setNurseSlots(2);
 const initial=mass(g);
 queue(g,room,'nurse',2);
 for(let i=0;i<1250;i++){
   run(g,1);
   if(i%47!==0)continue;
   assert.equal(mass(g),initial,'resource mass mismatch at tick '+i);
   assert.ok(g.lifecycle.nurseryStatus(room.id).used<=4);
   assert.ok(Object.values(g.foraging.inventory).every(v=>v>=0));
 }
 assert.equal(g.lifecycle.births,1);
});
