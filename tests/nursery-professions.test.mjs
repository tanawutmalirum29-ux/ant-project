import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { COMBAT } from '../src/core/combat.js';
import { UNDERGROUND } from '../src/world/generate.js';

const PROFESSIONS=['miner','forager','builder','nurse','soldier'];
const CIVILIAN=PROFESSIONS.filter(p=>p!=='soldier');
const tick=(g,n=1)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1);};
const promote=(g,profession,level=1)=>{
  const q=g.colony.queen;
  g.lifecycle.promote({profession,level,x:q.x,y:q.y});
  return g.colony.workers.at(-1);
};

test('CASTE-01: 25 profession/level combinations hatch once with unchanged identity and worker caste',()=>{
  const g=new Game('caste-25');
  const initial=g.colony.workers.length;
  const newborn=[];
  for(const profession of PROFESSIONS)for(let level=1;level<=5;level++)
    newborn.push(promote(g,profession,level));
  assert.equal(newborn.length,25);
  assert.equal(g.colony.workers.length,initial+25);
  assert.equal(new Set(newborn.map(a=>a.id)).size,25);
  g.workforce.reconcile();g.combat.allocate();
  for(const ant of newborn){
    assert.equal(ant.caste,'worker');
    assert.ok(PROFESSIONS.includes(ant.profession));
    assert.ok(Number.isInteger(ant.level)&&ant.level>=1&&ant.level<=5);
    if(ant.profession==='soldier'){
      assert.equal(ant.combatRole,'soldier');
      assert.equal(ant.squadId,'A');
      assert.equal(ant.combatHP,g.combat.maxHP(ant));
    }else{
      assert.notEqual(ant.combatRole,'soldier');
      assert.equal(g.combat.soldiers.includes(ant),false);
    }
  }
  assert.equal(g.combat.soldiers.length,5);
  const original=newborn.map(a=>[a,a.profession,a.level]);
  tick(g,2);
  for(const [ant,profession,level] of original){
    assert.equal(ant.profession,profession);
    assert.equal(ant.level,level);
  }
});

test('CASTE-02: specialists own their jobs; starters are civilian-only generalists',()=>{
  const g=new Game('caste-eligibility'),starters=[...g.colony.workers];
  const specialists=PROFESSIONS.map(p=>promote(g,p,3));
  for(const [i,ant] of specialists.entries()){
    for(const role of PROFESSIONS)
      assert.equal(g.colony.canWork(ant,role),role===PROFESSIONS[i],ant.profession+' / '+role);
  }
  for(const ant of starters){
    assert.ok(CIVILIAN.every(role=>g.colony.canWork(ant,role)));
    assert.equal(g.colony.canWork(ant,'soldier'),false);
  }
  assert.equal(g.colony.emergencyWorker('nurse'),null);
  assert.equal(g.colony.emergencyWorker('forager'),null);
  assert.equal(g.colony.isForager(specialists[1]),true);
  assert.equal(g.colony.isForager(specialists[0]),false);
});

test('CASTE-03: shortage fallback is bounded to one civilian without changing a caste',()=>{
  const g=new Game('caste-emergency');
  g.colony.workers.splice(0);
  const miners=[promote(g,'miner'),promote(g,'miner'),promote(g,'miner')];
  const nurse=promote(g,'nurse'),soldier=promote(g,'soldier');
  g.workforce.reconcile();
  const cover=g.colony.workers.filter(a=>g.colony.isForager(a));
  assert.equal(cover.length,1);
  assert.equal(cover[0].profession,'miner');
  assert.equal(g.colony.workers.filter(a=>g.colony.canWork(a,'forager')).length,1);
  assert.equal(g.colony.canWork(soldier,'forager'),false);
  assert.equal(g.colony.canWork(nurse,'miner'),false);
  const specialist=promote(g,'forager');
  assert.equal(g.colony.isForager(specialist),true);
  assert.ok(miners.every(a=>!g.colony.isForager(a)));
  assert.ok(g.colony.workers.every(a=>a.profession!=='starter'));
  assert.ok(miners.every(a=>a.profession==='miner'));
});

test('CASTE-04: forager Lv1–5 cargo bounds and miner/builder work multipliers',()=>{
  const g=new Game('caste-bonuses');
  const caps=[3,3,4,4,5];
  for(let level=1;level<=5;level++){
    const f=promote(g,'forager',level);
    assert.equal(g.foraging.carryCapacityFor(f),caps[level-1]);
    const m=promote(g,'miner',level),builder=promote(g,'builder',level);
    assert.equal(g.colony.workRate(m,'miner'),1+.2*(level-1));
    assert.equal(g.colony.workRate(builder,'builder'),1+.25*(level-1));
    assert.equal(g.colony.workRate(m,'builder'),0);
    assert.equal(g.colony.workRate(builder,'miner'),0);
  }
  assert.equal(g.foraging.carryCapacityFor({profession:'forager',level:99}),5);
  assert.equal(g.foraging.carryCapacityFor({profession:'forager',level:0}),3);
});

test('CASTE-05: hatch soldier A, transfer B, rally and retreat without demobilization',()=>{
  const g=new Game('caste-squads'),c=g.combat,q=g.colony.queen;
  const soldier=promote(g,'soldier',5);
  assert.equal(soldier.combatHP,COMBAT.soldierHP+12);
  assert.equal(c.damage(soldier),COMBAT.soldierDamage+2);
  assert.equal(c.maxHP(soldier),28);
  assert.equal(c.getSquad('A').data.count,1);
  assert.equal(c.transferSoldier(soldier.id,'B').ok,true);
  assert.equal(c.getSquad('B').data.count,1);
  assert.equal(c.setSquadRally('B',UNDERGROUND,q.x,q.y).ok,true);
  assert.equal(c.setSquadMode('B','retreat').ok,true);
  soldier.combatHP=6;
  const hp=soldier.combatHP;
  tick(g,150);
  assert.ok(soldier.combatHP>hp&&soldier.combatHP<=c.maxHP(soldier));
  assert.equal(soldier.squadId,'B');
  assert.equal(c.demobilize(soldier),false);
  assert.equal(c.releaseSoldier(soldier),false);
  assert.equal(c.setSoldierSlots(0),1);
  assert.equal(c.transferSoldier(g.colony.workers[0].id,'B').error.code,'NOT_ACTIVE_SOLDIER');
});

test('CASTE-06: no specialist can be assigned a cross-caste dig order',()=>{
  const g=new Game('caste-dig-guard');
  const soldier=promote(g,'soldier',1);
  assert.equal(g.colony.canWork(soldier,'miner'),false);
  g.colony.chooseOrder(soldier);
  assert.equal(soldier.orderId,null);
  const builder=promote(g,'builder',2);
  assert.equal(g.colony.canWork(builder,'miner'),false);
  g.colony.chooseOrder(builder);
  assert.equal(builder.orderId,null);
});

test('CASTE-07: high population, seeds, and ticks do not silently rewrite professions',()=>{
  for(const seed of ['high-pop-a','high-pop-b','high-pop-c']){
    const g=new Game(seed);
    for(let i=0;i<100;i++)promote(g,PROFESSIONS[i%5],1+i%5);
    assert.equal(g.colony.workers.length,105);
    assert.equal(g.combat.soldiers.length,20);
    const roster=g.colony.workers.map(a=>[a.id,a.profession,a.level]);
    tick(g,40);
    assert.equal(g.colony.workers.length,roster.length);
    assert.deepEqual(g.colony.workers.map(a=>[a.id,a.profession,a.level]),roster);
    const ids=new Set(g.colony.workers.map(a=>a.id));
    assert.equal(ids.size,roster.length);
    assert.ok(g.colony.workers.every(a=>a.profession!=='soldier'||
      (a.combatRole==='soldier'&&(a.squadId==='A'||a.squadId==='B')&&a.orderId==null)));
    assert.ok(g.foraging.nodes.every(n=>n.reserved>=0&&n.reserved<=n.amount));
  }
});

test('CASTE-08: Lv5 Forager physically gathers five units and delivers actual cargo',()=>{
  const g=new Game('caste-physical-forage');
  g.colony.setForageSlots(0); // Only the hatched specialist may forage.
  const ant=promote(g,'forager',5);
  const choice=g.foraging.chooseSource(ant);
  assert.ok(choice);
  assert.equal(choice.quantity,5);
  for(let i=0;i<1100&&!ant.cargo?.amount;i++)tick(g);
  assert.equal(ant.cargo?.amount,5);
  assert.ok(ant.state.startsWith('forage-'));
  const before=g.foraging.delivered;
  for(let i=0;i<900&&ant.cargo?.amount;i++)tick(g);
  assert.equal(ant.cargo,null);
  assert.equal(g.foraging.delivered,before+5);
  assert.ok(g.foraging.completedTrips>=1);
});

test('CASTE-09: 5,000-tick seed replay preserves capacity, role, reservation invariants',()=>{
  const simulate=()=>{
    const g=new Game('caste-long-run');
    for(let i=0;i<5000;i++){
      g.update(100);
      if(i%500===0){
        assert.ok(g.population<=150);
        assert.equal(new Set(g.colony.workers.map(a=>a.id)).size,g.colony.workers.length);
        assert.ok(g.colony.workers.every(a=>a.profession==='starter'));
        assert.ok(g.foraging.nodes.every(n=>n.reserved>=0&&n.reserved<=n.amount));
      }
    }
    return {ticks:g.clock.ticks,population:g.population,delivered:g.foraging.delivered,
      deaths:g.lifecycle.workerDeaths,stock:{...g.foraging.inventory}};
  };
  assert.deepEqual(simulate(),simulate());
});
