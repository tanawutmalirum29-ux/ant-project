import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WorkforcePolicy } from '../src/core/game.js';
import { UNDERGROUND, SURFACE } from '../src/world/generate.js';
import { DIRECTIONS, isDiggable } from '../src/world/navigation.js';

const tick=(g,n=1)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1)};
const policy=seed=>new Game(seed).workforce;
const sum=plan=>Object.values(plan).reduce((a,b)=>a+b,0);
test('ALLOC-01 default workforce percentages reproduce a playable 5-worker start',()=>{
 const g=new Game('percent-default');
 assert.deepEqual(g.workforce.shares,{forage:40,nurse:20,soldier:20});
 assert.equal(g.workforce.generalPercent,20);
 assert.deepEqual(g.workforce.plan(),{forage:2,nurse:1,soldier:1,general:1});
 assert.equal(g.colony.forageSlots,2);
 assert.equal(g.lifecycle.nurseSlots,1);
 assert.equal(g.combat.soldierSlots,1);
 assert.equal(g.combat.soldiers.length,1);
});
test('ALLOC-02 exact quota totals, deterministic largest-remainder tie breaking for 0–150 ants',()=>{
 const g=new Game('percent-rounding');
 for(let n=0;n<=150;n++){
   const a=g.workforce.plan(n);
   assert.equal(sum(a),n);
   assert.ok(Object.values(a).every(x=>Number.isInteger(x)&&x>=0));
   assert.deepEqual(a,g.workforce.plan(n));
 }
 assert.deepEqual(g.workforce.plan(7),{forage:3,nurse:2,soldier:1,general:1});
 assert.deepEqual(g.workforce.plan(1),{forage:1,nurse:0,soldier:0,general:0});
});
test('ALLOC-03 percentages remain fixed on worker births and deaths; targets self-update each tick',()=>{
 const g=new Game('percent-birth-death');
 g.colony.setForageSlots(0); // Legacy explicit command is intentionally a manual override.
 g.workforce.setShare('forage',30);
 g.workforce.setShare('nurse',25);
 g.workforce.setShare('soldier',15);
 assert.deepEqual(g.workforce.shares,{forage:30,nurse:25,soldier:15});
 assert.equal(g.workforce.generalPercent,30);
 for(let i=0;i<19;i++)g.lifecycle.promote({});
 tick(g);
 let goal=g.workforce.plan();
 assert.equal(g.colony.workers.length,24);
 assert.equal(sum(goal),24);
 assert.deepEqual([g.colony.forageSlots,g.lifecycle.nurseSlots,g.combat.soldierSlots],
   [goal.forage,goal.nurse,goal.soldier]);
 for(let i=0;i<12;i++)g.lifecycle.killWorker(g.colony.workers.at(-1));
 tick(g);
 goal=g.workforce.plan();
 assert.equal(g.colony.workers.length,12);
 assert.deepEqual([g.colony.forageSlots,g.lifecycle.nurseSlots,g.combat.soldierSlots],
   [goal.forage,goal.nurse,goal.soldier]);
 assert.deepEqual(g.workforce.shares,{forage:30,nurse:25,soldier:15});
});
test('ALLOC-04 invalid percent does not change allocations or steal general reserve',()=>{
 const g=new Game('percent-validation');
 const old={...g.workforce.shares};
 for(const [kind,value] of [['forage',65],['nurse',55],['soldier',45],['forage',-1],['unknown',0],['soldier',1.5]]) {
   assert.throws(()=>g.workforce.setShare(kind,value),RangeError);
   assert.deepEqual(g.workforce.shares,old);
 }
 g.workforce.setShare('forage',0);
 g.workforce.setShare('nurse',0);
 g.workforce.setShare('soldier',0);
 assert.equal(g.workforce.generalPercent,100);
 assert.deepEqual(g.workforce.plan(),{forage:0,nurse:0,soldier:0,general:5});
 assert.equal(g.combat.soldiers.length,0);
});
test('ALLOC-05 high foraging allocation must not overwrite a real carried resource trip',()=>{
 const g=new Game('percent-cargo-safe');
 g.workforce.setShare('nurse',0);g.workforce.setShare('soldier',0);
 const forager=g.colony.workers.at(-1);
 for(let i=0;i<900&&!forager.cargo?.amount;i++)tick(g);
 assert.ok(forager.cargo?.amount>0);
 const initial={...forager.cargo};
 g.workforce.setShare('forage',0);
 assert.equal(g.colony.forageSlots,0);
 assert.deepEqual(forager.cargo,initial);
 assert.ok(forager.state.startsWith('forage-'));
 for(let i=0;i<350 && forager.cargo?.amount;i++)tick(g);
 assert.equal(forager.cargo,null);
 assert.ok(g.foraging.completedTrips>0);
});
test('ALLOC-06 existing digging reservations are neither cancelled nor duplicated by slider changes',()=>{
 const g=new Game('percent-dig-protect');
 g.workforce.setShare('forage',0);
 g.workforce.setShare('nurse',0);
 g.workforce.setShare('soldier',0);
 const map=g.world.layers[UNDERGROUND],work=g.colony.workers[0];
 let target=null;
 for(let y=0;y<map.height&&!target;y++)for(let x=0;x<map.width&&!target;x++)
   if(isDiggable(map,x,y)&&DIRECTIONS.some(([dx,dy])=>{
     const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&
       nx<map.width&&ny<map.height&&[13,14,15].includes(map.cells[ny*map.width+nx]);
   }))target={x,y};
 assert.ok(target);
 g.colony.queueRectangle(target,target);
 tick(g);
 const job=g.colony.getOrder(target.x,target.y),assigned=g.colony.workers.find(a=>a.orderId===job?.id);
 assert.ok(assigned);
 g.workforce.setShare('forage',40);
 assert.equal(job.workerId,assigned.id);
 assert.equal(assigned.orderId,job.id);
 for(let i=0;i<250&&g.colony.getOrder(target.x,target.y);i++)tick(g);
 assert.equal(g.colony.getOrder(target.x,target.y),null);
 assert.equal(g.colony.completed,1);
});
test('ALLOC-07 busy brood carrier completes real delivery before its nurse quota decreases',()=>{
 const g=new Game('percent-brood-protect');
 g.workforce.setShare('forage',0);
 g.workforce.setShare('soldier',0);
 g.foraging.inventory.protein=12;
 let nurse=null;
 for(let i=0;i<240&&!nurse;i++){
   tick(g);
   nurse=g.colony.workers.find(w=>w.broodCargo);
 }
 assert.ok(nurse,'must carry brood before percentage change');
 const id=nurse.broodCargo;
 g.workforce.setShare('nurse',0);
 assert.equal(nurse.broodCargo,id,'slider must not drop carried brood');
 for(let i=0;i<180&&nurse.broodCargo;i++)tick(g);
 assert.equal(nurse.broodCargo,null);
 tick(g);
 assert.equal(g.lifecycle.nurseCount,0);
});
test('ALLOC-08 old numeric gameplay commands remain valid as deliberate per-role manual overrides',()=>{
 const g=new Game('manual-compat');
 g.colony.setForageSlots(0);
 g.lifecycle.setNurseSlots(0);
 g.combat.setSoldierSlots(0);
 for(let i=0;i<7;i++)g.lifecycle.promote({});
 tick(g);
 assert.equal(g.colony.forageSlots,0);
 assert.equal(g.lifecycle.nurseSlots,0);
 assert.equal(g.combat.soldierSlots,0);
 g.workforce.setShare('nurse',25);
 const target=g.workforce.plan();
 assert.equal(g.colony.forageSlots,target.forage);
 assert.equal(g.lifecycle.nurseSlots,target.nurse);
 assert.equal(g.combat.soldierSlots,target.soldier);
});
test('ALLOC-09 soldier quotas preserve emergency queen defence and do not discard rally order',()=>{
 const g=new Game('quota-queen-protection');
 g.workforce.setShare('forage',0);
 g.workforce.setShare('nurse',0);
 g.workforce.setShare('soldier',80);
 const s=g.combat.soldiers[0],q=g.colony.queen,entry=g.world.entrances[0].surface;
 assert.equal(g.combat.setRally(SURFACE,entry.x,entry.y),true);
 const e=g.combat.spawn('raider',UNDERGROUND,q.x,q.y);
 assert.ok(e);
 const current=g.combat.soldiers.length;
 g.workforce.setShare('soldier',0);
 assert.equal(g.combat.soldiers.length,current,'queen rescue defers demobilization');
 g.combat.enemies.splice(g.combat.enemies.indexOf(e),1);
 tick(g);
 assert.equal(g.combat.soldiers.length,0);
 assert.deepEqual(g.combat.rally,{layer:SURFACE,x:entry.x,y:entry.y});
});
