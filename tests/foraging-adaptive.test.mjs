import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { CARRY_CAPACITY } from '../src/core/foraging.js';
import { SURFACE, UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { isWalkable, reachablePaths } from '../src/world/navigation.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';

const run=(g,n)=>{for(let i=0;i<n;i++)g.update(100);};
const forager=g=>g.colony.workers.at(-1);
const keepOnly=(g,nodes)=>{
  const wanted=new Set(nodes.map(n=>n.id));
  for(const node of g.foraging.nodes)if(!wanted.has(node.id)){node.amount=0;node.reserved=0;}
};
const pending=(g,type)=>g.colony.workers.reduce((sum,w)=>
  sum+(w.cargo?.type===type?w.cargo.amount:0)+
  (g.foraging.nodes.find(n=>n.id===w.resourceId)?.type===type?w.reservedAmount||0:0),0);
const mass=(g,type)=>g.foraging.nodes.filter(n=>n.type===type).reduce((s,n)=>s+n.amount,0)+
  g.colony.workers.reduce((s,w)=>s+(w.cargo?.type===type?w.cargo.amount:0),0)+
  (g.foraging.inventory[type]||0)+(g.lifecycle.consumed[type]||0)+
  (g.lifecycle.lost[type]||0)+(g.rooms.held[type]||0)+(g.rooms.spent[type]||0);

test('NEXT-01 forage ranks relative shortage and uses available storage capacity',()=>{
  const g=new Game('adaptive-shortage');
  g.foraging.inventory.carbs=20;
  g.foraging.inventory.protein=20;
  assert.equal(g.foraging.pickNode(forager(g))?.type,'water',
    'water should outrank 20/24-stocked food types');
  g.foraging.inventory.water=24;
  assert.notEqual(g.foraging.pickNode(forager(g))?.type,'water',
    'a full water depot cannot accept another reservation');
});

test('NEXT-01 foragers prefer shorter reachable paths for equal shortage',()=>{
  const g=new Game('adaptive-distance'),ant=forager(g);
  const candidates=g.foraging.nodes.filter(n=>n.type==='carbs')
    .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
  assert.ok(candidates.length>=2);
  keepOnly(g,[candidates[0],candidates.at(-1)]);
  assert.equal(g.foraging.pickNode(ant)?.id,candidates[0].id);
});

test('NEXT-01 concurrent assignment never reserves more units than sources or depot can hold',()=>{
  const g=new Game('adaptive-concurrent');
  const node=g.foraging.nodes.find(n=>n.type==='carbs');
  keepOnly(g,[node]);node.amount=4;node.reserved=0;
  g.colony.setForageSlots(g.colony.workers.length);
  g.foraging.tick();
  const claims=g.colony.workers.map(w=>w.reservedAmount||0);
  assert.equal(node.reserved,4);
  assert.equal(claims.reduce((a,b)=>a+b,0),4);
  assert.ok(claims.every(n=>n>=0&&n<=CARRY_CAPACITY));
  assert.equal(node.amount,4,'reservation must not harvest in advance');
  for(const w of g.colony.workers)if(w.resourceId)assert.equal(w.resourceId,node.id);
});

test('NEXT-01 partial loads honor free space and in-flight cargo/claims',()=>{
  const g=new Game('adaptive-space'),node=g.foraging.nodes.find(n=>n.type==='carbs');
  keepOnly(g,[node]);node.amount=20;
  g.foraging.inventory.carbs=22;
  g.colony.setForageSlots(3);
  g.foraging.tick();
  assert.equal(node.reserved,2,'24-unit queen storage has only two free slots');
  assert.equal(pending(g,'carbs'),2);
  assert.ok(g.colony.workers.every(w=>(w.reservedAmount||0)<=2));
});

test('NEXT-01 a blocked source is skipped, never repeatedly assigned',()=>{
  const g=new Game('adaptive-unreachable'),node=g.foraging.nodes[0],ant=forager(g);
  keepOnly(g,[node]);
  const surface=g.world.layers[SURFACE],old=cellAt(surface,node.x,node.y);
  writeCell(surface,node.x,node.y,TERRAINS.STONE);
  run(g,40);
  assert.equal(node.reserved,0);
  assert.equal(g.foraging.activeCount,0);
  assert.equal(g.foraging.pickNode(ant),null);
  writeCell(surface,node.x,node.y,old);
  run(g,40);
  assert.ok(node.reserved>0 || g.colony.workers.some(w=>w.resourceId===node.id || w.cargo?.amount),
    'worker automatically reselects formerly blocked source');
});

test('NEXT-01 no source remains idle, then newly regrown stock wakes workers',()=>{
  const g=new Game('adaptive-regrowth'),node=g.foraging.nodes[0];
  for(const n of g.foraging.nodes){n.amount=0;n.initialAmount=0;n.reserved=0;}
  run(g,40);
  assert.equal(g.foraging.activeCount,0);
  node.amount=3; // Manual ecology injection, not a forager-side regeneration call.
  run(g,40);
  assert.ok(node.reserved>0 || g.colony.workers.some(w=>w.resourceId===node.id||w.cargo?.amount));
  assert.equal(node.amount+node.reserved>=0,true);
});

test('NEXT-01 depleted source mid-trip releases claim and walks back physically',()=>{
  const g=new Game('adaptive-midtrip'),node=g.foraging.nodes[0],ant=forager(g);
  g.colony.setForageSlots(1);keepOnly(g,[node]);
  for(let i=0;i<250&&ant.state!=='forage-to-source';i++)g.update(100);
  assert.equal(ant.state,'forage-to-source');
  node.amount=0;
  const before={x:ant.x,y:ant.y,layer:ant.layer};
  g.foraging.tick();
  assert.equal(ant.state,'forage-return-empty');
  assert.deepEqual({x:ant.x,y:ant.y,layer:ant.layer},before,
    'failed trip must not teleport worker across portal');
  assert.equal(node.reserved,0);
  run(g,250);
  assert.equal(ant.layer,UNDERGROUND);
  assert.equal(ant.state,'idle');
  assert.equal(g.foraging.delivered,0);
});

test('NEXT-01 full warehouse retains cargo until real space frees',()=>{
  const g=new Game('adaptive-wait-store'),ant=forager(g);
  g.colony.setForageSlots(1);
  g.foraging.inventory.carbs=24;
  ant.state='forage-return-underground';
  ant.cargo={type:'carbs',amount:2};ant.path=[];ant.next=null;
  g.foraging.tick();
  assert.equal(ant.state,'forage-wait-storage');
  assert.equal(ant.cargo.amount,2);
  assert.equal(g.foraging.inventory.carbs,24);
  g.foraging.inventory.carbs=22; // Explicit room inventory consumption in this fixture.
  run(g,60);
  assert.equal(ant.cargo,null);
  assert.equal(g.foraging.inventory.carbs,24);
  assert.equal(g.foraging.delivered,2);
});

test('NEXT-01 worker death releases source claims without duplicate cargo',()=>{
  const g=new Game('adaptive-death'),ant=forager(g);
  g.colony.setForageSlots(1);
  g.foraging.tick();
  const node=g.foraging.nodes.find(n=>n.id===ant.resourceId);
  assert.ok(node&&node.reserved>0);
  const claim=ant.reservedAmount;
  assert.equal(g.lifecycle.killWorker(ant),true);
  assert.equal(node.reserved,0);
  assert.equal(ant.reservedAmount,0);
  assert.equal(node.amount, node.initialAmount);
  assert.ok(claim>0);
});

test('NEXT-01 physical delivery and per-type mass remain conserved over long trips',()=>{
  const g=new Game('adaptive-mass');
  g.colony.setForageSlots(5);
  const initial=Object.fromEntries(RESOURCE_TYPES.map(t=>[t,mass(g,t)]));
  let surfaceVisit=false, cargoVisit=false;
  for(let i=0;i<1250;i++) {
    g.update(100);
    if(g.colony.workers.some(w=>w.layer===SURFACE))surfaceVisit=true;
    if(g.colony.workers.some(w=>w.cargo?.amount))cargoVisit=true;
    if(i%25===0) {
      for(const t of RESOURCE_TYPES)assert.equal(mass(g,t),initial[t],t+' mass at tick '+i);
      for(const node of g.foraging.nodes) {
        assert.ok(node.reserved>=0&&node.reserved<=node.amount,node.id+' claim invariant');
      }
      for(const ant of g.colony.workers) {
        assert.ok(isWalkable(g.world.layers[ant.layer],ant.x,ant.y));
        assert.ok((ant.cargo?.amount||0)<=CARRY_CAPACITY);
      }
    }
  }
  assert.ok(surfaceVisit&&cargoVisit);
  assert.ok(g.foraging.completedTrips>0);
  assert.ok(g.foraging.delivered>0);
});

test('NEXT-01 optional ecology metadata is read-only to foragers',()=>{
  const g=new Game('adaptive-contract'),node=g.foraging.nodes[0];
  node.maxAmount=node.initialAmount;node.regrowthProgress=0.75;
  const before={maxAmount:node.maxAmount,regrowthProgress:node.regrowthProgress};
  run(g,75);
  assert.equal(node.maxAmount,before.maxAmount);
  assert.equal(node.regrowthProgress,before.regrowthProgress);
});

test('NEXT-01 identical seeds and workloads remain deterministic',()=>{
  const a=new Game('adaptive-replay'),b=new Game('adaptive-replay');
  a.colony.setForageSlots(3);b.colony.setForageSlots(3);
  run(a,220);run(b,220);
  assert.deepEqual(a.foraging.nodes,b.foraging.nodes);
  assert.deepEqual(a.foraging.inventory,b.foraging.inventory);
  assert.deepEqual(a.colony.workers,b.colony.workers);
  assert.equal(a.foraging.delivered,b.foraging.delivered);
});

test('NEXT-01 disconnected portal cannot pull resources through walls',()=>{
  const g=new Game('adaptive-portal'),entry=g.world.entrances[0].underground;
  const l=g.world.layers[UNDERGROUND],previous=cellAt(l,entry.x,entry.y);
  writeCell(l,entry.x,entry.y,TERRAINS.ROCK);
  run(g,30);
  assert.equal(g.foraging.activeCount,0);
  assert.ok(g.foraging.nodes.every(n=>n.reserved===0));
  writeCell(l,entry.x,entry.y,previous);
  run(g,40);
  assert.ok(g.foraging.nodes.some(n=>n.reserved>0) ||
    g.colony.workers.some(w=>w.state.startsWith('forage-')));
});
