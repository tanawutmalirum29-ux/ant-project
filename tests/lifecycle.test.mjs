import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { LIFE } from '../src/core/lifecycle.js';
import { UNDERGROUND, SURFACE, TERRAINS, cellAt } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';
const run = (g,ticks) => {for(let i=0;i<ticks;i++)g.update(100);};
const totalSource = g => g.foraging.nodes.reduce((n,v)=>n+v.initialAmount,0);
function mass(g) {
  const stock=Object.values(g.foraging.inventory).reduce((s,v)=>s+v,0);
  const inHand=g.colony.workers.reduce((s,a)=>s+(a.cargo?.amount||0),0);
  const sources=g.foraging.nodes.reduce((s,v)=>s+v.amount,0);
  const eaten=Object.values(g.lifecycle.consumed).reduce((s,v)=>s+v,0);
  const lost=Object.values(g.lifecycle.lost).reduce((s,v)=>s+v,0);
  return sources+stock+inHand+eaten+lost;
}

test('U4.1 queen lays real eggs only with deposited protein; brood is separate from adults',()=>{
 const g=new Game();g.colony.setForageSlots(0);run(g,LIFE.layInterval*3);
 assert.equal(g.lifecycle.brood.length,0);assert.equal(g.population,6);
 g.foraging.inventory.protein=2;
 run(g,LIFE.layInterval);assert.equal(g.lifecycle.eggs,1);
 assert.equal(g.lifecycle.consumed.protein,1);assert.equal(g.population,6);
});
test('U4.2 egg -> larva -> pupa -> worker with nursing and protein paid exactly once',()=>{
 const g=new Game('newborn');g.colony.setForageSlots(0);
 g.foraging.inventory.protein=20;g.foraging.inventory.carbs=20;g.foraging.inventory.water=20;
 const start=g.population;
 run(g,850);
 assert.ok(g.lifecycle.births>=1,'no adult emerged');
 assert.ok(g.population>start);
 assert.ok(g.lifecycle.consumed.protein>=g.lifecycle.births*2);
 assert.ok(g.colony.workers.some(a=>a.id==='worker-6'));
 assert.ok(g.colony.workers.every(a=>isWalkable(g.world.layers[a.layer],a.x,a.y)));
});
test('U4.3 nurses must travel through tunnels to chamber and cannot perform two jobs',()=>{
 const g=new Game();g.colony.setForageSlots(0);g.foraging.inventory.protein=12;
 run(g,LIFE.layInterval+10);
 const nurses=g.colony.workers.filter(a=>a.state==='nursing');
 assert.equal(nurses.length,1);
 assert.ok(nurses.every(a=>a.orderId===null && a.layer===UNDERGROUND));
 run(g,200);
 assert.ok(g.lifecycle.brood.some(b=>b.care>0));
 g.lifecycle.setNurseSlots(0);
 assert.equal(g.lifecycle.nurseCount,0);
 assert.ok(g.colony.workers.every(a=>a.state!=='nursing'));
});
test('U4.4 without nurses the larvae stall and eventually perish; no free workers',()=>{
 const g=new Game();g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
 g.foraging.inventory.protein=1;
 run(g,1850);
 assert.equal(g.lifecycle.births,0);
 assert.ok(g.lifecycle.broodDeaths>=1);
 assert.equal(g.population,6);
});
test('U4.5 hungry and thirsty workers eat from actual cache; ledger is conserved',()=>{
 const g=new Game();g.colony.setForageSlots(0);
 g.foraging.inventory.carbs=6;g.foraging.inventory.water=6;
 run(g,LIFE.drinkInterval+1);
 assert.ok(g.lifecycle.consumed.carbs>=6);
 assert.ok(g.lifecycle.consumed.water>=6);
 assert.equal(g.foraging.inventory.carbs,0);
 assert.equal(g.foraging.inventory.water,0);
});
test('U4.6 worker death returns assigned dig job to queue, does not break order indexes',()=>{
 const g=new Game();g.colony.setForageSlots(0);
 const l=g.world.layers[UNDERGROUND];let f=null;
 for(let y=1;y<l.height-1&&!f;y++)for(let x=1;x<l.width-1&&!f;x++){
   if(![TERRAINS.SOIL,TERRAINS.HARD_SOIL].includes(cellAt(l,x,y)))continue;
   if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>isWalkable(l,x+dx,y+dy)))f={x,y};
 }
 assert.ok(f);
 g.colony.queueRectangle(f,f);run(g,1);
 const worker=g.colony.workers.find(w=>w.orderId!=null);
 assert.ok(worker);
 const order=g.colony.getOrder(f.x,f.y);
 assert.equal(order.workerId,worker.id);
 assert.equal(g.lifecycle.killWorker(worker),true);
 assert.equal(order.workerId,null);assert.equal(order.status,'queued');
 assert.equal(g.colony.orders.size,g.colony.ordersById.size);
 assert.equal(g.colony.workers.length,4);
 run(g,300);
 assert.equal(g.colony.pendingCount,0);assert.equal(g.colony.completed,1);
 assert.equal(g.colony.ordersById.size,0);
});
test('U4.7 forager death releases reservation and accounts for cargo without duplication',()=>{
 const g=new Game();g.colony.setForageSlots(1);
 const ant=g.colony.workers.at(-1);
 run(g,2);assert.ok(ant.resourceId);
 let reserved=g.foraging.nodes.find(n=>n.id===ant.resourceId);
 assert.ok(reserved.reserved>0);
 g.lifecycle.killWorker(ant);
 assert.equal(reserved.reserved,0);
 assert.ok(g.foraging.nodes.every(n=>n.reserved<=n.amount));
 const source=g.foraging.nodes[0];
 const another=g.colony.workers[0];
 source.amount-=2;another.cargo={type:source.type,amount:2};
 g.lifecycle.killWorker(another);
 assert.equal(g.lifecycle.lost[source.type],2);
 assert.equal(mass(g),totalSource(g));
});
test('U4.8 no food multiplication during 5000 ticks including growth, work, death and consumption',()=>{
 const g=new Game('life-mass');const initial=totalSource(g);
 for(let i=0;i<5000;i++){
   if(i%61===0)g.toggleLayer();
   g.update(100);
   if(i%97===0){
     assert.equal(mass(g),initial);
     assert.ok(g.colony.workers.every(a=>isWalkable(g.world.layers[a.layer],a.x,a.y)));
     assert.ok(Object.values(g.foraging.inventory).every(n=>n>=0&&Number.isSafeInteger(n)));
     assert.ok(g.foraging.nodes.every(n=>n.reserved>=0&&n.reserved<=n.amount));
     assert.ok(g.lifecycle.brood.length<=LIFE.broodLimit);
   }
 }
 assert.ok(g.lifecycle.births>=5);
 assert.ok(g.lifecycle.consumed.protein>0);
});
test('U4.9 pause and world-switch freeze or preserve egg growth and hunger correctly',()=>{
 const g=new Game();g.colony.setForageSlots(0);g.foraging.inventory.protein=5;
 run(g,180);const before=JSON.stringify({brood:g.lifecycle.brood,health:[...g.lifecycle.adultHealth],consumed:g.lifecycle.consumed});
 g.setSpeed(0);run(g,2000);
 assert.equal(JSON.stringify({brood:g.lifecycle.brood,health:[...g.lifecycle.adultHealth],consumed:g.lifecycle.consumed}),before);
 g.toggleLayer();g.setSpeed(4);run(g,50);
 assert.equal(g.lifecycle.tickCount,380);
 assert.ok(g.lifecycle.larvae>0);
});
test('U4.10 queen and workers naturally die after prolonged starvation; no negative population or ghost assignments',()=>{
 const g=new Game('famine');g.colony.setForageSlots(0);
 run(g,LIFE.queenStarve+650);
 assert.equal(g.colony.queen.alive,false);
 assert.equal(g.population,0);
 assert.equal(g.colony.workers.length,0);
 assert.equal(g.lifecycle.adultHealth.size,0);
 assert.ok(g.lifecycle.workerDeaths>=5);
 assert.equal(g.lifecycle.nurseCount,0);
 assert.equal(g.lifecycle.births,0);
});
test('U4.11 nurse/forager settings clamp on adult losses; grow back without duplicate IDs',()=>{
 const g=new Game();g.colony.setForageSlots(5);g.lifecycle.setNurseSlots(5);
 const removed=g.colony.workers.slice(0,4);
 for(const w of removed)g.lifecycle.killWorker(w);
 assert.equal(g.colony.forageSlots,1);
 assert.equal(g.lifecycle.nurseSlots,1);
 assert.throws(()=>g.lifecycle.setNurseSlots(2),RangeError);
 assert.equal(g.colony.workers.length,1);
 g.lifecycle.promote({});
 assert.equal(g.colony.workers.length,2);
 assert.equal(new Set(g.colony.workers.map(w=>w.id)).size,2);
});
test('U4.12 fresh same-seed world resets all life counters and deterministic growth',()=>{
 const before=new Game('growing');run(before,2200);
 assert.ok(before.lifecycle.births>0);
 const after=new Game('growing');
 assert.equal(after.lifecycle.births,0);
 assert.equal(after.lifecycle.brood.length,0);
 assert.equal(after.population,6);
 assert.deepEqual(after.foraging.nodes,new Game('growing').foraging.nodes);
 const same=new Game('growing');run(same,2200);
 assert.deepEqual(before.lifecycle.brood,same.lifecycle.brood);
 assert.equal(before.lifecycle.births,same.lifecycle.births);
 assert.deepEqual(before.foraging.inventory,same.foraging.inventory);
});

test('U4.13 age-based death respects lifespan and removes workers only once',()=>{
 const g=new Game();g.colony.setForageSlots(0);const a=g.colony.workers[0];
 g.lifecycle.adultHealth.get(a.id).age=LIFE.workerMaxAge-1;
 run(g,1);
 assert.equal(g.lifecycle.workerDeaths,1);
 assert.equal(g.colony.workers.includes(a),false);
 assert.equal(g.lifecycle.killWorker(a),false);
 assert.equal(g.lifecycle.workerDeaths,1);
 g.lifecycle.queenHealth.age=LIFE.queenMaxAge-1;
 run(g,1);
 assert.equal(g.colony.queen.alive,false);
 assert.equal(g.population,4);
});
