import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

const run=(game,ticks)=>{for(let n=0;n<ticks;n++)game.update(100);};
function nurseryFixture(seed='nursery-caste'){
  const g=new Game(seed),q=g.colony.queen;
  g.foraging.inventory={carbs:24,protein:24,water:24};
  g.rooms.syncInventory();
  const room={id:'nursery-fixture',type:'nursery',x:q.x-4,y:q.y,width:2,height:2,
    status:'ready',connected:true,progress:65,ticks:65,workerId:null,broodSlots:4,
    cost:{carbs:3,protein:2},capacity:{},stock:{carbs:0,protein:0,water:0}};
  g.rooms.rooms.push(room);
  g.rooms.updateConnectivity();
  assert.equal(room.status,'ready','fixture Nursery must physically connect');
  return {g,room};
}
test('Nursery requires a ready room; never lays automatically',()=>{
  const g=new Game('nursery-without-room');
  g.foraging.inventory.protein=12;
  run(g,540);
  assert.equal(g.lifecycle.brood.length,0);
  assert.equal(g.lifecycle.eggOrders.length,0);
  assert.equal(g.lifecycle.queueEgg('missing','miner',1).ok,false);
});
test('Egg order reserves exactly one slot and cancels with exact one-time refund',()=>{
  const {g,room}=nurseryFixture('nursery-slots');
  const life=g.lifecycle,start={...g.foraging.inventory};
  const orders=Array.from({length:4},()=>life.queueEgg(room.id,'miner',1));
  assert.ok(orders.every(v=>v.ok));
  assert.equal(life.nurseryStatus(room.id).used,4);
  assert.equal(life.nurseryStatus(room.id).free,0);
  assert.equal(life.queueEgg(room.id,'miner',1).reason,'nursery-full');
  assert.equal(life.heldEgg.carbs,4);
  assert.equal(life.heldEgg.protein,4);
  const tiles=new Set(orders.map(o=>o.order.slot.x+','+o.order.slot.y));
  assert.equal(tiles.size,4);
  assert.equal(life.cancelEgg(orders[0].order.id),true);
  assert.equal(life.cancelEgg(orders[0].order.id),false);
  assert.equal(life.heldEgg.carbs,3);
  assert.equal(g.foraging.inventory.carbs,start.carbs-3);
  assert.equal(g.foraging.inventory.protein,start.protein-3);
  assert.equal(life.nurseryStatus(room.id).free,1);
});
test('Invalid level, resources, dead queen and disabled room never mutate stock',()=>{
  const {g,room}=nurseryFixture('nursery-guard');
  const stock={...g.foraging.inventory};
  assert.equal(g.lifecycle.queueEgg(room.id,'miner',0).reason,'invalid-choice');
  room.status='disabled';room.connected=false;
  assert.equal(g.lifecycle.queueEgg(room.id,'miner',1).reason,'nursery-unavailable');
  room.status='ready';room.connected=true;
  assert.equal(g.lifecycle.queueEgg(room.id,'soldier',5).reason,'ok');
  assert.equal(g.lifecycle.queueEgg(room.id,'soldier',5).reason,'insufficient-resources');
  assert.equal(g.lifecycle.cancelEgg(g.lifecycle.eggOrders[0].id),true);
  assert.deepEqual(g.foraging.inventory,stock);
  g.colony.queen.alive=false;
  assert.equal(g.lifecycle.queueEgg(room.id,'miner',1).reason,'queen-dead');
});
test('Queen lays only reserved eggs on real tiles, after 180 ticks',()=>{
  const {g,room}=nurseryFixture('nursery-laying');
  const q=g.colony.queen;
  const order=g.lifecycle.queueEgg(room.id,'miner',1);
  assert.ok(order.ok);
  run(g,179);
  assert.equal(g.lifecycle.brood.length,0);
  run(g,1);
  assert.equal(g.lifecycle.brood.length,1);
  assert.equal(g.lifecycle.eggOrders[0].status,'AWAITING_PICKUP');
  const egg=g.lifecycle.brood[0];
  assert.notDeepEqual({x:egg.x,y:egg.y},{x:q.x,y:q.y});
  assert.equal(egg.age,0,'waiting egg must not incubate before physical delivery');
  assert.equal(g.lifecycle.cancelEgg(order.order.id),false,'laid egg cannot refund');
});
test('Population reservation counts queued orders and excludes double count after lay',()=>{
  const {g,room}=nurseryFixture('nursery-population');
  const before=g.lifecycle.totalPopulation;
  assert.equal(g.lifecycle.queueEgg(room.id,'nurse',1).ok,true);
  assert.equal(g.lifecycle.totalPopulation,before+1);
  run(g,180);
  assert.equal(g.lifecycle.totalPopulation,before+1);
});
test('Starter ants and permanent Soldier are different professions',()=>{
  const {g}=nurseryFixture('nursery-professions');
  assert.equal(g.colony.workers.filter(a=>a.profession==='starter').length,5);
  assert.equal(g.combat.soldiers.length,0);
  const infant={profession:'soldier',level:5,x:g.colony.queen.x,y:g.colony.queen.y};
  g.lifecycle.promote(infant);
  const ant=g.colony.workers.at(-1);
  assert.equal(ant.profession,'soldier');
  assert.equal(ant.level,5);
  assert.equal(ant.combatRole,'soldier');
  assert.equal(ant.squadId,'A');
  assert.equal(g.combat.maxHP(ant),28);
  assert.equal(g.colony.canWork(ant,'miner'),false);
});

test('Physical pickup, nursery delivery, care and incubation hatch one requested specialist',()=>{
  const {g,room}=nurseryFixture('nursery-physical-hatch');
  const accepted=g.lifecycle.queueEgg(room.id,'miner',1);
  assert.equal(accepted.ok,true);
  run(g,1200);
  const hatch=g.colony.workers.find(a=>a.id==='worker-6');
  assert.ok(hatch,'reserved egg must hatch via physical nursery delivery');
  assert.equal(hatch.profession,'miner');
  assert.equal(hatch.level,1);
  assert.equal(g.lifecycle.eggOrders.length,0,'hatch releases one reservation');
  assert.equal(g.lifecycle.births,1);
});
