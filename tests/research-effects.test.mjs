import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { BASE_CAPACITY } from '../src/core/rooms.js';
import { UNDERGROUND, TERRAINS } from '../src/world/generate.js';
import { isDiggable, isWalkable } from '../src/world/navigation.js';

const enable=(g,ids=[])=>{
  const unlocked=new Set(ids);
  const research={
    hasCompleted:id=>unlocked.has(id),
    refundableFor:()=>0
  };
  for(const subsystem of ['colony','foraging','rooms','lifecycle','combat'])
    g[subsystem].research=research;
  g.lifecycle.combat=g.combat;
  return {unlocked,research};
};
const fund=(g,carbs=20,protein=20,water=20)=>{
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
  Object.assign(g.foraging.inventory,{carbs,protein,water});
  g.rooms.syncInventory();
};
const sumStock=(g,type)=>g.rooms.rooms.reduce((n,r)=>n+(r.stock?.[type]||0),0);
const source=(g,terrain=TERRAINS.SOIL)=>{
  const map=g.world.layers[UNDERGROUND];
  const steps=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=1;y<map.height-1;y++)for(let x=1;x<map.width-1;x++) {
    if(!isDiggable(map,x,y)||map.cells[y*map.width+x]!==terrain)continue;
    for(const [dx,dy] of steps)if(isWalkable(map,x+dx,y+dy))
      return {x,y,site:{x:x+dx,y:y+dy}};
  }
  throw new Error('No reachable soil cell in deterministic fixture');
};
function preparedDig(level=1,upgraded=false) {
  const g=new Game('CP-B-DIG');
  const {unlocked}=enable(g,upgraded?['excavation_tools']:[]);
  g.colony.setForageSlots(0);
  const p=source(g);
  const r=g.colony.queueRectangle(p,p);
  assert.equal(r.added,1);
  const job=g.colony.getOrder(p.x,p.y);
  const ant=g.colony.workers[0];
  Object.assign(ant,{profession:'miner',level,layer:UNDERGROUND,x:p.site.x,y:p.site.y,
    state:'digging',orderId:job.id,path:[],next:null,motion:0});
  Object.assign(job,{workerId:ant.id,status:'digging'});
  return {g,job,p,unlocked};
}
function digUntilDone(prepared){
  const {g,p}=prepared;
  for(let n=1;n<=90;n++){
    g.colony.tick();
    if(!g.colony.getOrder(p.x,p.y))return n;
  }
  throw new Error('Dig did not finish');
}
function preparedBuild(level=1,upgraded=false){
  const g=new Game('CP-B-BUILD');
  const {unlocked}=enable(g,upgraded?['construction_techniques']:[]);
  fund(g);
  const q=g.colony.queen;
  const result=g.rooms.queue('nursery',q.x+2,q.y);
  assert.equal(result.ok,true);
  const room=result.room,ant=g.colony.workers[0];
  // Already purchased real materials; isolate the building-work stage after
  // physically completed material pickup and travel.
  for(const pickup of room.pickups)pickup.collected=true;
  Object.assign(ant,{profession:'builder',level,layer:UNDERGROUND,x:room.x,y:room.y,
    roomId:room.id,state:'room-build',path:[],next:null,motion:0});
  Object.assign(room,{status:'building',workerId:ant.id});
  return {g,room,ant,unlocked};
}
function buildUntilDone({g,room,ant}){
  const layer=g.world.layers[UNDERGROUND];
  for(let n=1;n<=200;n++){
    assert.equal(g.rooms.advance(room,ant,layer),true);
    if(room.status==='ready')return n;
  }
  throw new Error('Room did not finish');
}

test('CP-B1 unchanged no-research baseline and bounded future trip capacities Lv1/Lv5',()=>{
  const a=new Game('CP-B-NONE'),b=new Game('CP-B-NONE');
  enable(b);
  for(let n=0;n<180;n++){a.update(100);b.update(100);}
  assert.deepEqual(b.foraging.inventory,a.foraging.inventory);
  assert.deepEqual(b.colony.workers,a.colony.workers);
  assert.deepEqual(b.rooms.rooms,a.rooms.rooms);
  const g=new Game('CP-B-FORAGE'),{unlocked}=enable(g);
  const ant=g.colony.workers[0];ant.profession='forager';
  ant.level=1;assert.equal(g.foraging.carryCapacityFor(ant),3);
  ant.level=5;assert.equal(g.foraging.carryCapacityFor(ant),5);
  unlocked.add('foraging_routes');
  ant.level=1;assert.equal(g.foraging.carryCapacityFor(ant),4);
  ant.level=5;assert.equal(g.foraging.carryCapacityFor(ant),6);
  assert.equal(g.foraging.inventory.carbs,0);
  // Unlock is a selector, not repeated additive state mutation.
  for(let n=0;n<10;n++)assert.equal(g.foraging.carryCapacityFor(ant),6);
});

test('CP-B2 excavation is exact fixed-point work; old partial jobs retain progress',()=>{
  assert.equal(digUntilDone(preparedDig(1)),12);
  assert.equal(digUntilDone(preparedDig(1,true)),11);
  assert.equal(digUntilDone(preparedDig(5,true)),6);
  const job=preparedDig(1);
  job.g.colony.tick();job.g.colony.tick();
  assert.equal(job.job.progress,2);
  job.unlocked.add('excavation_tools');
  assert.equal(digUntilDone(job),9);
  assert.equal(job.job.progressUnits,Math.round(2*10000)+9*11500);
});

test('CP-B3 actual material-funded room construction scales work, not costs',()=>{
  assert.equal(buildUntilDone(preparedBuild(1)),65);
  assert.equal(buildUntilDone(preparedBuild(1,true)),57);
  assert.equal(buildUntilDone(preparedBuild(5,true)),29);
  const partial=preparedBuild(1);
  for(let i=0;i<3;i++)partial.g.rooms.advance(partial.room,partial.ant,partial.g.world.layers[UNDERGROUND]);
  assert.equal(partial.room.progress,3);
  partial.unlocked.add('construction_techniques');
  const rest=buildUntilDone(partial);
  assert.equal(rest,54);
  assert.equal(partial.room.progressUnits,3*10000+54*11500);
  assert.equal(partial.g.rooms.spent.carbs,3);
  assert.equal(partial.g.rooms.held.carbs,0);
});

test('CP-B4 Nursery reduced integer stage targets respect actual delivery and care gates',()=>{
  const g=new Game('CP-B-NURSERY'),{unlocked}=enable(g);
  const old=g.lifecycle.hatchStages(1);
  assert.deepEqual(old,{egg:100,larva:180,pupa:160});
  unlocked.add('nursery_care');
  assert.deepEqual(g.lifecycle.hatchStages(1),{egg:90,larva:162,pupa:144});
  const higher=g.lifecycle.hatchStages(5);
  assert.equal(higher.egg+higher.larva+higher.pupa,1026);
  const baby={id:'brood-unit',orderId:'egg-unit',profession:'miner',level:1,
    stage:'egg',age:89,care:0,waiting:0,roomId:null,carrierId:null,x:g.colony.queen.x,y:g.colony.queen.y};
  const order={id:'egg-unit',roomId:'n-unit',status:'AWAITING_PICKUP',broodId:baby.id,level:1,remainingTicks:396};
  g.lifecycle.brood.push(baby);g.lifecycle.eggOrders.push(order);
  g.lifecycle.tickBrood();assert.equal(baby.age,89);assert.equal(baby.stage,'egg');
  g.rooms.rooms.push({id:'n-unit',type:'nursery',x:0,y:0,width:2,height:2,status:'ready',
    connected:true,stock:{carbs:0,protein:0,water:0}});
  baby.roomId='n-unit';order.status='INCUBATING';
  g.lifecycle.tickBrood();assert.equal(baby.stage,'larva');
  baby.age=162;baby.care=0;
  g.lifecycle.tickBrood();assert.equal(baby.stage,'larva');
  baby.care=90; // Still requires a physically paid protein feed to pupate.
  g.lifecycle.tickBrood();assert.equal(baby.stage,'larva');
  assert.equal(g.lifecycle.eggSpent.protein,0);
});

test('CP-B5 depot scaling uses real per-room caps and keeps nominal/connected distinct',()=>{
  const g=new Game('CP-B-STORAGE'),{unlocked}=enable(g);
  const depot=g.rooms.rooms[0];
  assert.deepEqual(g.rooms.capacities(),BASE_CAPACITY);
  const store={id:'food-unit',type:'food_store',status:'ready',connected:true,capacity:{carbs:40,protein:40},
    stock:{carbs:0,protein:0,water:0},width:2,height:2,x:depot.x+3,y:depot.y};
  g.rooms.rooms.push(store);
  assert.equal(g.rooms.capacityFor('carbs'),64);
  unlocked.add('warehouse_extension');
  assert.equal(g.rooms.capacityFor('carbs'),76);
  assert.equal(g.rooms.capacityFor('water'),28);
  assert.equal(g.rooms.effectiveRoomCap(store,'carbs'),48);
  assert.equal(g.rooms.storageSlots('carbs')[0].space,28);
  store.connected=false;
  assert.equal(g.rooms.capacityFor('carbs'),76);
  assert.equal(g.rooms.storageSlots('carbs').length,1);
  assert.equal(g.rooms.storageSlots('water')[0].space,28);
  for(let n=0;n<12;n++)assert.equal(g.rooms.capacityFor('carbs'),76);
  assert.equal(sumStock(g,'carbs'),0);
});

test('CP-B6 construction refund source liabilities cannot be overfilled or minted',()=>{
  const g=new Game('CP-B-ESCROW'),{research}=enable(g);
  fund(g,20,20,20);
  const q=g.colony.queen;
  const r=g.rooms.queue('rest',q.x+2,q.y);
  assert.equal(r.ok,true);
  const queen=g.rooms.rooms[0];
  // Synthetic liabilities exercise exact original-source math alongside a
  // real queued construction order and its actually deducted materials.
  g.lifecycle.eggOrders.push({id:'claim-unit',status:'QUEUED',pickups:[
    {sourceRoomId:'room-queen',type:'carbs',amount:2}]});
  research.refundableFor=(roomId,type)=>roomId==='room-queen'&&type==='carbs'?3:0;
  assert.equal(g.rooms.refundableForSource('room-queen','carbs'),7);
  assert.equal(g.rooms.storageSlots('carbs')[0].space,Math.max(0,24-queen.stock.carbs-7));
  // A deleted original depot must stop cancellation with zero mutation.
  g.rooms.rooms.shift();
  const held={...g.rooms.held},inventory={...g.foraging.inventory};
  assert.equal(g.rooms.cancel(r.room.id),false);
  assert.deepEqual(g.rooms.held,held);
  assert.deepEqual(g.foraging.inventory,inventory);
  g.rooms.rooms.unshift(queen);
  assert.equal(g.rooms.cancel(r.room.id),true);
  assert.equal(g.rooms.held.carbs,0);
  assert.equal(g.foraging.inventory.carbs,20);
});

test('CP-B7 armor changes both squads maximum only, never current HP or damage',()=>{
  const g=new Game('CP-B-ARMOR'),{unlocked}=enable(g);
  const a=g.lifecycle.promote({profession:'soldier',level:1,x:g.colony.queen.x,y:g.colony.queen.y});
  const first=g.combat.soldiers.at(-1);
  assert.equal(g.combat.maxHP(first),16);
  first.combatHP=4;
  const oldDamage=g.combat.damage(first);
  unlocked.add('soldier_armor');
  assert.equal(g.combat.maxHP(first),18);
  assert.equal(first.combatHP,4);
  first.squadId='B';
  g.combat.allocate();assert.equal(first.combatHP,4);
  assert.equal(g.combat.damage(first),oldDamage);
  g.lifecycle.promote({profession:'soldier',level:5,x:g.colony.queen.x,y:g.colony.queen.y});
  const newborn=g.combat.soldiers.at(-1);
  assert.equal(g.combat.maxHP(newborn),32);
  assert.equal(newborn.combatHP,32);
  assert.equal(g.combat.getSquad('B').data.soldiers.find(s=>s.id===first.id).maxHP,18);
  assert.equal(g.combat.getSquad('A').data.soldiers.find(s=>s.id===newborn.id).maxHP,32);
});

test('CP-B8 150-ant *synthetic promotion stress* keeps research effects bounded',()=>{
  const g=new Game('CP-B-SCALE');
  enable(g,['foraging_routes','excavation_tools','construction_techniques',
    'nursery_care','warehouse_extension','soldier_armor']);
  for(let n=0;n<144;n++)g.lifecycle.promote({profession:n%5===0?'soldier':'miner',
    level:1+n%5,x:g.colony.queen.x,y:g.colony.queen.y});
  assert.equal(g.colony.population,150);
  for(const ant of g.colony.workers){
    if(ant.profession==='soldier')assert.ok(g.combat.maxHP(ant)<=32);
    assert.ok(g.foraging.carryCapacityFor(ant)<=6);
  }
  assert.equal(g.rooms.capacityFor('carbs'),28);
});
