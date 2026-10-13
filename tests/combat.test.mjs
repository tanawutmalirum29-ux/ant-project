import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { COMBAT, ENEMIES } from '../src/core/combat.js';
import { SURFACE, UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';
const tick=(g,n=1)=>{for(let i=0;i<n;i++)g.update(100);};
const setup=(seed='U6')=>{const g=new Game(seed);g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);Object.assign(g.foraging.inventory,{carbs:20,protein:20,water:20});return g;};
const entry=(g,layer)=>g.world.entrances[0][layer];
const isValid=(g,unit)=>isWalkable(g.world.layers[unit.layer],unit.x,unit.y);
const mass=g=>g.foraging.nodes.reduce((s,n)=>s+n.amount,0)+Object.values(g.foraging.inventory).reduce((s,n)=>s+n,0)+g.colony.workers.reduce((s,a)=>s+(a.cargo?.amount||0),0)+['consumed','lost'].reduce((s,k)=>s+Object.values(g.lifecycle[k]).reduce((a,b)=>a+b,0),0)+['held','spent'].reduce((s,k)=>s+Object.values(g.rooms[k]).reduce((a,b)=>a+b,0),0);

test('U6.1 idle baseline preserves earlier gameplay and does not spawn early',()=>{
 const g=new Game('old-case');assert.equal(g.combat.soldierSlots,0);assert.equal(g.combat.threatCount,0);
 tick(g,230);assert.equal(g.combat.threatCount,0);assert.equal(g.colony.population,6);
});
test('U6.2 soldier policy recruits only eligible idle non-foragers and can demobilize',()=>{
 const g=new Game();assert.equal(g.colony.forageSlots,2);
 assert.equal(g.combat.setSoldierSlots(5),3);
 assert.equal(g.combat.soldiers.length,3);
 assert.ok(g.combat.soldiers.every(a=>!g.colony.isForager(a)&&a.orderId==null));
 assert.equal(g.combat.setSoldierSlots(1),1);
 assert.equal(g.combat.soldiers.length,1);
 assert.equal(g.colony.workers.filter(a=>a.state==='idle').length,4);
});
test('U6.3 invalid soldier, strategy, and impassable pheromone commands rejected',()=>{
 const g=setup();assert.throws(()=>g.combat.setSoldierSlots(-1),RangeError);
 assert.throws(()=>g.combat.setSoldierSlots(100),RangeError);
 assert.throws(()=>g.combat.setSoldierSlots(1.5),RangeError);
 assert.throws(()=>g.combat.setMode('attack-everything'),RangeError);
 assert.equal(g.combat.setRally(UNDERGROUND,0,0),false);
 assert.equal(g.combat.setRally(SURFACE,64,64),true);
 assert.equal(g.combat.mode,'rally');
});
test('U6.4 seed produces deterministic threat spawn on actual walkable map',()=>{
 const a=setup('stochastic-seed'),b=setup('stochastic-seed');
 const one=a.combat.spawn('beetle'),two=b.combat.spawn('beetle');
 assert.ok(one);assert.deepEqual(one,two);
 assert.ok(isValid(a,one));assert.ok(Math.abs(one.x-entry(a,SURFACE).x)<=20);
 assert.equal(a.combat.spawn('bogus'),null);
});
test('U6.5 bounded enemy count and unique never-reused IDs',()=>{
 const g=setup();for(let i=0;i<COMBAT.maxEnemies;i++)assert.ok(g.combat.spawn('raider'));
 assert.equal(g.combat.spawn('raider'),null);
 const killed=g.combat.enemies.shift();const next=g.combat.spawn('beetle');
 assert.notEqual(killed.id,next.id);assert.equal(g.combat.enemies.length,COMBAT.maxEnemies);
});
test('U6.6 surface invader must walk to portal before crossing to real underground entrance',()=>{
 const g=setup('portal');const enemy=g.combat.spawn('raider',SURFACE,entry(g,SURFACE).x+6,entry(g,SURFACE).y);
 assert.ok(enemy);const first={x:enemy.x,y:enemy.y};
 tick(g,5);assert.equal(enemy.layer,SURFACE);assert.notDeepEqual({x:enemy.x,y:enemy.y},first);
 for(let i=0;i<150&&enemy.layer===SURFACE;i++)tick(g);
 assert.equal(enemy.layer,UNDERGROUND);assert.ok(g.combat.portalCrossings>=1);
 assert.ok(isValid(g,enemy));
});
test('U6.7 soldier intercepts physical threat and attack has real damage/cooldown',()=>{
 const g=setup('combat');g.combat.setSoldierSlots(2);
 const enemy=g.combat.spawn('beetle',UNDERGROUND,g.colony.queen.x,g.colony.queen.y-4);
 assert.ok(enemy);const start=enemy.hp;let struck=false;let moved=false;
 const pos=g.combat.soldiers.map(a=>({x:a.x,y:a.y}));
 for(let i=0;i<240&&g.combat.enemies.includes(enemy);i++){
  tick(g);
  if(enemy.hp<start)struck=true;
  if(g.combat.soldiers.some((a,n)=>a.x!==pos[n]?.x||a.y!==pos[n]?.y))moved=true;
  assert.ok(g.combat.enemies.every(e=>isValid(g,e)));
 }
 assert.ok(struck);assert.ok(moved);assert.equal(g.combat.enemies.includes(enemy),false);assert.ok(g.combat.defeated>=1);
});
test('U6.8 no remote attack across layers or long distance',()=>{
 const g=setup('no-remote');g.combat.setSoldierSlots(1);
 const enemy=g.combat.spawn('beetle',SURFACE,entry(g,SURFACE).x+11,entry(g,SURFACE).y);
 assert.ok(enemy);tick(g,1);
 assert.equal(enemy.hp,ENEMIES.beetle.hp);
 assert.equal(enemy.layer,SURFACE);
});
test('U6.9 enemy attacks queen only after reaching her tile neighborhood and can stop reproduction',()=>{
 const g=setup('queen-in-danger');g.combat.setSoldierSlots(0);
 const q=g.colony.queen;for(const w of g.colony.workers){w.layer=SURFACE;w.x=entry(g,SURFACE).x;w.y=entry(g,SURFACE).y;}const enemy=g.combat.spawn('beetle',UNDERGROUND,q.x,q.y+1);
 assert.ok(enemy);const initial=g.combat.queenHP;tick(g,1);
 assert.ok(g.combat.queenHP<initial);
 for(let i=0;i<900&&q.alive;i++)tick(g);
 assert.equal(q.alive,false);assert.equal(g.combat.queenHP,0);
 const count=g.lifecycle.births;tick(g,200);assert.equal(g.lifecycle.births,count);
});
test('U6.10 killed worker returns assigned dig order and resource ledger remains consistent',()=>{
 const g=setup('casualty');const ant=g.colony.workers[0];
 const soil={x:ant.x+5,y:ant.y+1};
 const m=mass(g); // external damage changes no resource quantities.
 const enemy=g.combat.spawn('beetle',UNDERGROUND,ant.x,ant.y);
 assert.ok(enemy);
 for(let i=0;i<180&&g.colony.workers.includes(ant);i++)tick(g);
 assert.equal(g.colony.workers.includes(ant),false);
 assert.ok(g.combat.casualties>=1);
 assert.equal(mass(g),m);
});
test('U6.11 retreat mode moves soldier to recovery and heals at real tile',()=>{
 const g=setup('healing');g.combat.setSoldierSlots(1);const ant=g.combat.soldiers[0];
 ant.combatHP=6;ant.x+=3;
 const start={x:ant.x,y:ant.y};g.combat.setMode('retreat');
 for(let i=0;i<COMBAT.healInterval*4;i++)tick(g);
 assert.notDeepEqual({x:ant.x,y:ant.y},start);
 assert.equal(ant.x,g.colony.queen.x);assert.equal(ant.y,g.colony.queen.y);
 assert.ok(ant.combatHP>6);assert.ok(ant.combatHP<=COMBAT.soldierHP);
});
test('U6.12 rally waypoint requires real movement, including surface portal crossing',()=>{
 const g=setup('rally');g.combat.setSoldierSlots(1);
 const target={...entry(g,SURFACE),x:entry(g,SURFACE).x+4};
 assert.ok(g.combat.setRally(SURFACE,target.x,target.y));
 const ant=g.combat.soldiers[0];let travelled=false;
 for(let i=0;i<160;i++){tick(g);if(ant.layer===SURFACE){travelled=true;if(ant.x===target.x&&ant.y===target.y)break;}}
 assert.ok(travelled);assert.deepEqual({x:ant.x,y:ant.y,layer:ant.layer},{...target,layer:SURFACE});
});
test('U6.13 pause freezes threats, attacks and defender movement',()=>{
 const g=setup('freeze');g.combat.setSoldierSlots(1);const enemy=g.combat.spawn('raider');
 assert.ok(enemy);const snapshot=JSON.stringify({soldiers:g.combat.soldiers,enemies:g.combat.enemies,ticks:g.combat.tickCount});
 g.setSpeed(0);tick(g,120);
 assert.equal(JSON.stringify({soldiers:g.combat.soldiers,enemies:g.combat.enemies,ticks:g.combat.tickCount}),snapshot);
});
test('U6.14 injuries do not grant magic instant healing away from nest',()=>{
 const g=setup('no-free-health');g.combat.setSoldierSlots(1);
 const ant=g.combat.soldiers[0];ant.combatHP=5;
 assert.equal(ant.combatHP,5);
 g.combat.setMode('retreat');tick(g,1);
 assert.equal(ant.combatHP,5);
});
test('U6.15 seed world reset clears enemy, corpses, and soldier choices',()=>{
 const g=setup('reset');g.combat.setSoldierSlots(2);g.combat.spawn('beetle');
 const fresh=new Game('reset');
 assert.equal(fresh.combat.soldiers.length,0);assert.equal(fresh.combat.threatCount,0);
 assert.equal(fresh.combat.tickCount,0);assert.equal(fresh.combat.defeated,0);
});
test('U6.16 long battlefield simulation respects tile collision and resource conservation',()=>{
 const g=setup('stress-u6');g.combat.setSoldierSlots(2);
 g.combat.spawn('beetle');g.combat.spawn('raider');
 const initial=mass(g);
 for(let i=0;i<900;i++){
  tick(g);
  if(i%20!==0)continue;
  assert.ok(g.combat.enemies.every(e=>isValid(g,e)));
  assert.ok(g.colony.workers.every(a=>isValid(g,a)));
  assert.ok(g.combat.enemies.length<=COMBAT.maxEnemies);
  assert.equal(mass(g),initial);
 }
});

test('U6.17 demobilization and re-enlistment cannot magically heal an injured soldier',()=>{
 const g=setup('no-instant-heal');g.combat.setSoldierSlots(1);
 const soldier=g.combat.soldiers[0];soldier.combatHP=4;
 g.combat.setSoldierSlots(0);
 assert.equal(soldier.combatHP,4);
 g.combat.setSoldierSlots(1);
 assert.equal(soldier.combatHP,4);
});
test('U6.18 damage persists if a soldier returns to ordinary worker duties',()=>{
 const g=setup('damage-persistent');g.combat.setSoldierSlots(1);
 const soldier=g.combat.soldiers[0];soldier.combatHP=2;
 g.combat.setSoldierSlots(0);
 const enemy=g.combat.spawn('beetle',UNDERGROUND,soldier.x,soldier.y);
 assert.ok(enemy);tick(g);
 assert.equal(g.colony.workers.includes(soldier),false);
 assert.equal(g.combat.casualties,1);
});
