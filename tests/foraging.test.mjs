import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { SURFACE, UNDERGROUND, TERRAINS, cellAt } from '../src/world/generate.js';
import { isWalkable, reachablePaths } from '../src/world/navigation.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';
import { CARRY_CAPACITY } from '../src/core/foraging.js';

const run=(g,ticks)=>{for(let i=0;i<ticks;i++)g.update(100)};
const deposited = g => Object.values(g.foraging.inventory).reduce((a,b)=>a+b,0);
const inTransit = g => g.colony.workers.reduce((a,w)=>a+(w.cargo?.amount||0),0);
const conserved = g => deposited(g)+inTransit(g)+g.foraging.remaining;
const initial = g => g.foraging.nodes.reduce((a,b)=>a+b.initialAmount,0);
const validAll = g => g.colony.workers.every(w => isWalkable(g.world.layers[w.layer],w.x,w.y));

test('U3.1 seeded source generation is stable, accessible and does not cover nest portal',()=>{
  for (const seed of ['ANT-001','alpha','x','99','different world']) {
    const g=new Game(seed), other=new Game(seed), world=g.world, layer=world.layers[SURFACE];
    assert.deepEqual(g.foraging.nodes,other.foraging.nodes);
    assert.ok(g.foraging.nodes.length>=9);
    const paths=reachablePaths(layer,world.entrances[0].surface);
    const ids=new Set(),positions=new Set();
    for(const node of g.foraging.nodes){
      assert.ok(RESOURCE_TYPES.includes(node.type));assert.ok(node.amount>0);assert.equal(node.reserved,0);
      assert.ok(paths.distance(node.x,node.y)>=6);
      assert.ok(isWalkable(layer,node.x,node.y));
      assert.ok(!ids.has(node.id));ids.add(node.id);
      const key=`${node.x},${node.y}`;assert.ok(!positions.has(key));positions.add(key);
    }
  }
});
test('U3.2 ants traverse actual entrances; inventory changes only after underground delivery',()=>{
  const g=new Game(), entrance=g.world.entrances[0], ant=g.colony.workers[4];
  g.colony.setForageSlots(1);
  assert.equal(ant.layer,UNDERGROUND);assert.equal(deposited(g),0);
  let sawSurface=false,sawCargo=false,sawReturn=false;
  for(let i=0;i<750;i++){
    g.update(100);
    if(ant.layer===SURFACE) sawSurface=true;
    if(ant.cargo?.amount){sawCargo=true;assert.equal(deposited(g),0);}
    if(sawCargo && ant.layer===UNDERGROUND) sawReturn=true;
    if(deposited(g)>0)break;
  }
  assert.ok(sawSurface && sawCargo && sawReturn);
  assert.ok(deposited(g)>0);
  assert.equal(g.foraging.delivered,deposited(g));
  assert.ok(g.foraging.completedTrips>0);
  assert.ok(validAll(g));
  assert.equal(cellAt(g.world.layers[SURFACE],entrance.surface.x,entrance.surface.y),TERRAINS.ENTRANCE);
});
test('U3.3 no food is created or duplicated: exact mass conservation across trips and reservations',()=>{
  const g=new Game('mass-test'),total=initial(g);
  for(let i=0;i<2000;i++){
    g.update(100);
    if(i%7===0){
      assert.equal(conserved(g),total);
      assert.equal(g.foraging.delivered,deposited(g));
      for(const node of g.foraging.nodes) {
        assert.ok(node.amount>=0);assert.ok(node.reserved>=0);assert.ok(node.reserved<=node.amount);
      }
      for(const w of g.colony.workers)assert.ok((w.cargo?.amount||0)<=CARRY_CAPACITY);
    }
  }
  assert.ok(g.foraging.completedTrips>=8);
  assert.ok(RESOURCE_TYPES.some(t=>g.foraging.inventory[t]>0));
});
test('U3.4 pause and speed freeze/advance both ant movement and food stock without duplication',()=>{
  const g=new Game();run(g,50);
  const snapshot=JSON.stringify({workers:g.colony.workers,inventory:g.foraging.inventory,nodes:g.foraging.nodes});
  const ticks=g.clock.ticks;
  g.setSpeed(0);run(g,500);
  assert.equal(g.clock.ticks,ticks);
  assert.equal(snapshot,JSON.stringify({workers:g.colony.workers,inventory:g.foraging.inventory,nodes:g.foraging.nodes}));
  g.setSpeed(4);run(g,200);
  assert.equal(g.clock.ticks,ticks+800);
  assert.equal(conserved(g),initial(g));
});
test('U3.5 layer switching does not pause, duplicate or teleport ants',()=>{
  const g=new Game(),total=initial(g);
  for(let i=0;i<800;i++){
    if(i%3===0)g.toggleLayer();
    g.update(100);
    if(i%17===0){assert.equal(conserved(g),total);assert.ok(validAll(g));}
  }
  assert.ok(deposited(g)>0);
});
test('U3.6 adjustable forager allocation coexists with U2 digging',()=>{
  const g=new Game();
  assert.throws(()=>g.colony.setForageSlots(6),RangeError);
  assert.throws(()=>g.colony.setForageSlots(-1),RangeError);
  g.colony.setForageSlots(0);
  run(g,100);
  assert.equal(g.foraging.activeCount,0);
  g.colony.setForageSlots(2);
  let f=null, l=g.world.layers[UNDERGROUND];
  for(let y=1;y<l.height-1&&!f;y++)for(let x=1;x<l.width-1&&!f;x++){
    if(![10,11].includes(cellAt(l,x,y)))continue;
    if([[0,-1],[0,1],[1,0],[-1,0]].some(([dx,dy])=>isWalkable(l,x+dx,y+dy)))f={x,y};
  }
  assert.ok(f);
  assert.equal(g.colony.queueRectangle(f,f).added,1);
  run(g,450);
  assert.equal(cellAt(l,f.x,f.y),TERRAINS.TUNNEL);
  assert.ok(g.foraging.delivered>0);
  assert.equal(conserved(g),initial(g));
  g.colony.setForageSlots(5);
  run(g,450);
  assert.ok(g.foraging.completedTrips>2);
  assert.ok(validAll(g));
});
test('U3.7 when all sources deplete no further food is harvested and workers do not get stuck',()=>{
  const g=new Game();
  for(const node of g.foraging.nodes){node.amount=0;node.initialAmount=0;node.reserved=0;}
  run(g,100);
  assert.equal(g.foraging.activeCount,0);
  assert.equal(deposited(g),0);
  assert.ok(g.colony.workers.every(w=>w.state==='idle'));
});
test('U3.8 reset creates independent fresh stock and ants with same deterministic world',()=>{
  const before=new Game('reset-world');run(before,450);
  const after=new Game('reset-world');
  assert.equal(deposited(after),0);
  assert.equal(after.clock.ticks,0);
  assert.equal(after.colony.population,6);
  assert.deepEqual(after.foraging.nodes,new Game('reset-world').foraging.nodes);
  assert.equal(after.foraging.nodes.reduce((a,n)=>a+n.amount,0),initial(after));
  assert.notStrictEqual(before.foraging.nodes,after.foraging.nodes);
});
test('U3.9 long-run workers stay on valid terrain, carry safely, and count deposits once',()=>{
  const g=new Game('stress');g.colony.setForageSlots(5);
  const total=initial(g);
  for(let i=0;i<3200;i++){
    g.update(100);
    if(i%67===0){assert.ok(validAll(g));assert.equal(conserved(g),total);}
  }
  assert.ok(g.foraging.completedTrips>=40);
  assert.ok(g.foraging.nodes.some(n=>n.amount< n.initialAmount));
  assert.ok(Object.values(g.foraging.inventory).every(v=>Number.isInteger(v)&&v>=0));
});
