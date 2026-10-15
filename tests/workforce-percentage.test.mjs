import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { UNDERGROUND, SURFACE } from '../src/world/generate.js';
import { DIRECTIONS, isDiggable } from '../src/world/navigation.js';

const tick=(g,n=1)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1);};
const snapshot=g=>g.colony.workers.map(a=>({id:a.id,profession:a.profession,level:a.level}));

test('ALLOC-01 five starters remain generalists, never auto-conscripted',()=>{
  const g=new Game('permanent-default');
  assert.equal(g.colony.workers.length,5);
  assert.ok(g.colony.workers.every(a=>a.profession==='starter'&&a.level===1));
  assert.equal(g.combat.soldiers.length,0);
  assert.equal(g.combat.soldierSlots,0);
  assert.equal(g.colony.forageSlots,2);
  assert.equal(g.lifecycle.nurseSlots,1);
  for(const ant of g.colony.workers)for(const role of ['miner','forager','builder','nurse'])
    assert.equal(g.colony.canWork(ant,role),true);
  assert.ok(g.colony.workers.every(a=>!g.colony.canWork(a,'soldier')));
});

test('ALLOC-02 percentage plan is compatibility-only, not a roster writer',()=>{
  const g=new Game('permanent-plan'),before=snapshot(g);
  for(const shares of [{forage:0,nurse:0,soldier:100},{forage:60,nurse:40,soldier:0}]) {
    g.workforce.setShare('forage',0);
    g.workforce.setShare('nurse',0);
    g.workforce.setShare('soldier',0);
    for(const [kind,value] of Object.entries(shares))g.workforce.setShare(kind,value);
    g.workforce.reconcile();
    assert.deepEqual(snapshot(g),before);
    assert.equal(g.combat.soldiers.length,0);
  }
});

test('ALLOC-03 actual birth/death and caste mix drive available specialists',()=>{
  const g=new Game('permanent-reconcile');
  const baby={x:g.colony.queen.x,y:g.colony.queen.y};
  for(const profession of ['miner','forager','builder','nurse','soldier'])
    g.lifecycle.promote({...baby,profession,level:3});
  g.workforce.reconcile();
  assert.equal(g.combat.soldiers.length,1);
  assert.equal(g.lifecycle.nurseSlots,1);
  const caste=snapshot(g);
  tick(g,2);
  assert.deepEqual(snapshot(g),caste);
  const nurse=g.colony.workers.find(a=>a.profession==='nurse');
  g.lifecycle.killWorker(nurse);
  const replacement=g.colony.workers.find(a=>a.profession==='miner');
  g.lifecycle.killWorker(replacement);
  g.lifecycle.promote({...baby,profession:'nurse',level:5});
  g.lifecycle.promote({...baby,profession:'miner',level:1});
  g.workforce.reconcile();
  assert.equal(g.lifecycle.nurseSlots,1);
  assert.equal(g.combat.soldiers.length,1);
});

test('ALLOC-04 invalid old percentage input is rejected without altering a caste',()=>{
  const g=new Game('permanent-validation'),before=snapshot(g),shares={...g.workforce.shares};
  for(const [kind,value] of [['forage',101],['nurse',-1],['soldier',1.5],['unknown',0]]) {
    assert.throws(()=>g.workforce.setShare(kind,value),RangeError);
    assert.deepEqual(snapshot(g),before);
    assert.deepEqual(g.workforce.shares,shares);
  }
});

test('ALLOC-05 compatibility UI changes cannot discard real forager cargo',()=>{
  const g=new Game('permanent-cargo'),ant=g.colony.workers.at(-1);
  for(let i=0;i<950&&!ant.cargo?.amount;i++)tick(g);
  assert.ok(ant.cargo?.amount>0);
  const cargo={...ant.cargo};
  g.workforce.setShare('forage',0);
  assert.deepEqual(ant.cargo,cargo);
  assert.ok(ant.state.startsWith('forage-'));
  for(let i=0;i<500&&ant.cargo?.amount;i++)tick(g);
  assert.equal(ant.cargo,null);
  assert.ok(g.foraging.completedTrips>0);
});

test('ALLOC-06 already-reserved excavation is not stolen by workforce reconciliation',()=>{
  const g=new Game('permanent-dig');
  g.colony.setForageSlots(0);
  const map=g.world.layers[UNDERGROUND];
  let target=null;
  for(let y=0;y<map.height&&!target;y++)for(let x=0;x<map.width&&!target;x++)
    if(isDiggable(map,x,y)&&DIRECTIONS.some(([dx,dy])=>{
      const nx=x+dx,ny=y+dy;
      return nx>=0&&ny>=0&&nx<map.width&&ny<map.height&&[13,14,15].includes(map.cells[ny*map.width+nx]);
    }))target={x,y};
  assert.ok(target);
  g.colony.queueRectangle(target,target);
  tick(g);
  const job=g.colony.getOrder(target.x,target.y);
  const ant=g.colony.workers.find(a=>a.orderId===job?.id);
  assert.ok(ant);
  g.workforce.setShare('forage',40);
  assert.equal(job.workerId,ant.id);
  assert.equal(ant.orderId,job.id);
  for(let i=0;i<350&&g.colony.getOrder(target.x,target.y);i++)tick(g);
  assert.equal(g.colony.getOrder(target.x,target.y),null);
});

test('ALLOC-07 nurse carrying an egg is not reassigned on a policy refresh',()=>{
  const g=new Game('nurse-policy');
  const nurse=g.colony.workers[0];
  nurse.state='nursing';nurse.broodCargo='brood-test';nurse.nurseDestination={x:nurse.x,y:nurse.y};
  g.workforce.setShare('nurse',0);
  g.workforce.reconcile();
  assert.equal(nurse.profession,'starter');
  assert.equal(nurse.state,'nursing');
  assert.equal(nurse.broodCargo,'brood-test');
});

test('ALLOC-08 former soldier count commands never draft a civilian',()=>{
  const g=new Game('permanent-manual'),before=snapshot(g);
  assert.equal(g.combat.setSoldierSlots(3),0);
  g.colony.setForageSlots(0);
  g.lifecycle.setNurseSlots(0);
  tick(g);
  assert.deepEqual(snapshot(g),before);
  assert.equal(g.combat.soldiers.length,0);
});

test('ALLOC-09 permanent Soldier and A/B rally survive compatibility quota changes',()=>{
  const g=new Game('permanent-queen'),q=g.colony.queen,entry=g.world.entrances[0].surface;
  g.lifecycle.promote({profession:'soldier',level:4,x:q.x,y:q.y});
  const soldier=g.combat.soldiers[0];
  assert.ok(soldier);
  assert.equal(g.combat.setRally(SURFACE,entry.x,entry.y),true);
  assert.equal(g.combat.transferSoldier(soldier.id,'B').ok,true);
  g.workforce.setShare('soldier',0);
  g.combat.setSoldierSlots(0);
  tick(g);
  assert.equal(g.combat.soldiers[0],soldier);
  assert.equal(soldier.squadId,'B');
  assert.equal(soldier.level,4);
  assert.equal(g.combat.demobilize(soldier),false);
  assert.deepEqual(g.combat.rally,{layer:SURFACE,x:entry.x,y:entry.y});
});
