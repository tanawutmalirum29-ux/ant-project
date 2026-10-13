import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';
import { RESOURCE_REGROWTH_TICKS } from '../src/core/resource-ecology.js';
import { WEATHER_FACTORS, WEATHER_PHASE_TICKS } from '../src/core/weather.js';
import { weatherVisualKind } from '../src/render/renderer.js';
import { weatherHudText } from '../src/ui/app.js';
import { isWalkable } from '../src/world/navigation.js';

const zero=()=>({carbs:0,protein:0,water:0});
const totals=g=>Object.fromEntries(RESOURCE_TYPES.map(type=>[type,g.world.resources.filter(n=>n.type===type).reduce((s,n)=>s+n.amount,0)]));
function physical(g,type){
 return {
   source:g.foraging.nodes.filter(n=>n.type===type).reduce((s,n)=>s+n.amount,0),
   cargo:g.colony.workers.reduce((s,n)=>s+(n.cargo?.type===type?n.cargo.amount:0),0),
   stored:g.foraging.inventory[type],consumed:g.lifecycle.consumed[type],lost:g.lifecycle.lost[type],
   held:g.rooms.held[type],spent:g.rooms.spent[type]
 };
}
function verify(g,initial,seed,tick){
 for(const type of RESOURCE_TYPES){
   const values=physical(g,type);
   const expected=initial[type]+g.ecology.regenerated[type];
   assert.equal(Object.values(values).reduce((s,n)=>s+n,0),expected,
    `${seed} at tick ${tick}, ${type} conservation ledger ${JSON.stringify(values)}, renewed ${g.ecology.regenerated[type]}`);
   for(const value of Object.values(values))assert.ok(Number.isSafeInteger(value)&&value>=0);
 }
 for(const n of g.world.resources){
   assert.ok(Number.isSafeInteger(n.amount)&&n.amount>=0&&n.amount<=n.maxAmount,`invalid source ${n.id}`);
   assert.ok(Number.isSafeInteger(n.reserved)&&n.reserved>=0&&n.reserved<=n.amount,`invalid reservation ${n.id}`);
   assert.ok(Number.isFinite(n.regrowthProgress)&&n.regrowthProgress>=0&&n.regrowthProgress<1,`invalid progress ${n.id}`);
   const owners=g.colony.workers.reduce((s,a)=>s+(a.resourceId===n.id?(a.reservedAmount||0):0),0);
   assert.equal(n.reserved,owners,`stranded reservation for ${n.id}`);
 }
 for(const ant of g.colony.workers)
   assert.equal(isWalkable(g.world.layers[ant.layer],ant.x,ant.y),true,`${seed} ant ${ant.id} in solid rock`);
 assert.deepEqual(g.ecology.weather,g.weather);
 assert.ok(['clear','rain','dry'].includes(g.weather.kind));
 assert.strictEqual(g.weather.factors,WEATHER_FACTORS[g.weather.kind]);
 assert.ok(g.weather.remainingTicks>0&&g.weather.remainingTicks<=WEATHER_PHASE_TICKS);
}

test('NEXT02-INT-01 real weather is the shared clock, ecology consumes it and renderer/HUD read identical state',()=>{
 const g=new Game('weather-system-integration');
 assert.equal(g.weather.kind,'clear');
 assert.equal(g.weather.remainingTicks,4800);
 assert.equal(g.ecology.weather,g.weather);
 assert.equal(g.ecology.world,g.world);
 assert.strictEqual(g.foraging.nodes,g.world.resources);
 assert.equal(weatherVisualKind(g),'clear');
 assert.match(weatherHudText(g.weather).short,/ปกติ/);
 assert.ok(g.systems.findIndex(fn=>fn.toString().includes('weather.tick()'))>=0);
 const w=g.systems.findIndex(fn=>fn.toString().includes('weather.tick()'));
 const e=g.systems.findIndex(fn=>fn.toString().includes('ecology.tick()'));
 assert.ok(w>=0&&w<e,'the weather step must run before renewal each tick');
 for(let i=0;i<123;i++)g.update(100);
 assert.equal(g.clock.ticks,123);
 assert.equal(g.weather.remainingTicks,4800-123);
 g.setSpeed(0);
 const snap=JSON.stringify({weather:{kind:g.weather.kind,ticks:g.weather.remainingTicks},ecology:g.ecology.regenerated,sources:g.world.resources});
 for(let i=0;i<50;i++)g.update(250);
 assert.equal(JSON.stringify({weather:{kind:g.weather.kind,ticks:g.weather.remainingTicks},ecology:g.ecology.regenerated,sources:g.world.resources}),snap);
 g.setSpeed(2);g.update(100);
 assert.equal(g.weather.remainingTicks,4800-125);
 g.setSpeed(4);g.update(100);
 assert.equal(g.weather.remainingTicks,4800-129);
});

test('NEXT02-INT-02 boundary uses NEW weather on SAME tick without lost fractional regrowth',()=>{
 const g=new Game('weather-boundary-case');
 g.colony.setForageSlots(0);
 for(let i=0;i<WEATHER_PHASE_TICKS-2;i++)g.update(100);
 assert.equal(g.weather.kind,'clear');
 const site=g.world.resources.find(n=>n.type==='water');
 site.amount=0;site.reserved=0;
 g.update(100);
 const before=site.regrowthProgress;
 assert.ok(Math.abs(before-1/RESOURCE_REGROWTH_TICKS.water)<1e-12);
 g.update(100);
 assert.notEqual(g.weather.kind,'clear');
 assert.equal(g.weather.remainingTicks,WEATHER_PHASE_TICKS);
 const factor=g.weather.factors.water;
 const correct=(1+factor)/RESOURCE_REGROWTH_TICKS.water;
 assert.ok(Math.abs(site.regrowthProgress-correct)<1e-12,
  `boundary progress ${site.regrowthProgress} expected ${correct}`);
 assert.equal(site.amount,0);
 assert.equal(weatherVisualKind(g),g.weather.kind);
 const badge=weatherHudText(g.weather);
 assert.ok(badge.short.includes(g.weather.kind==='rain'?'ฝนตก':'แล้ง'));
 assert.ok(badge.short.includes('4800t'));
});

test('NEXT02-INT-03 one full cycle and seed resets reproduce the same phase sequence and ecology',()=>{
 const a=new Game('weather-replay-game'),b=new Game('weather-replay-game');
 for(let i=0;i<10000;i++){
  a.update(100);b.update(100);
 }
 assert.equal(a.weather.kind,b.weather.kind);
 assert.equal(a.weather.remainingTicks,b.weather.remainingTicks);
 assert.deepEqual(a.ecology.regenerated,b.ecology.regenerated);
 assert.deepEqual(a.foraging.nodes,b.foraging.nodes);
 assert.deepEqual(a.foraging.inventory,b.foraging.inventory);
 const c=new Game('weather-replay-game');
 assert.equal(c.weather.kind,'clear');
 assert.equal(c.weather.remainingTicks,4800);
 assert.deepEqual(c.ecology.regenerated,zero());
});

test('NEXT02-INT-04 30,000 advancing gameplay ticks × 3 seeds conserve nutrients in all weather',()=>{
 const phases=new Set();
 for(const seed of ['NEXT02-rain-01','NEXT02-dry-02','NEXT02-clear-03']){
  const g=new Game(seed),initial=totals(g);
  verify(g,initial,seed,0);
  const phaseKinds=[g.weather.kind];let last=g.weather.kind;
  for(let i=1;i<=30000;i++){
   assert.equal(g.update(100),1);
   if(g.weather.kind!==last){phaseKinds.push(g.weather.kind);last=g.weather.kind;}
   if(i%317===0 || i===30000)verify(g,initial,seed,i);
  }
  assert.equal(g.clock.ticks,30000);
  assert.ok(phaseKinds.length>=7,`missing weather transitions for ${seed}: ${phaseKinds}`);
  for(let j=1;j<phaseKinds.length;j++)assert.notEqual(phaseKinds[j],phaseKinds[j-1]);
  for(const kind of phaseKinds)phases.add(kind);
  for(const type of RESOURCE_TYPES)assert.ok(g.ecology.regenerated[type]>0,`${seed} missing renewal for ${type}`);
  assert.ok(g.foraging.completedTrips>0,`${seed} missing physical hauling`);
  verify(g,initial,seed,30000);
 }
 assert.deepEqual([...phases].sort(),['clear','dry','rain'],'integrated scenario must actually cover every weather phase');
});
