import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';
import { RESOURCE_REGROWTH_TICKS } from '../src/core/resource-ecology.js';
import { SURFACE, UNDERGROUND } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';

const newGame = seed => new Game(seed);
function components(game,type) {
  return {
    source:game.foraging.nodes.filter(n=>n.type===type).reduce((s,n)=>s+n.amount,0),
    inTransit:game.colony.workers.reduce((s,w)=>s+(w.cargo?.type===type?w.cargo.amount:0),0),
    stock:game.foraging.inventory[type],
    consumed:game.lifecycle.consumed[type],
    lost:game.lifecycle.lost[type],
    held:game.rooms.held[type],
    spent:game.rooms.spent[type]
  };
}
function audit(game,origin,seed,step) {
  for(const type of RESOURCE_TYPES){
    const parts=components(game,type);
    const lhs=origin[type]+game.ecology.regenerated[type];
    const rhs=Object.values(parts).reduce((x,y)=>x+y,0);
    for(const [label,n] of Object.entries(parts)){
      assert.ok(Number.isSafeInteger(n)&&n>=0,`${seed} tick ${step} ${type}.${label} ${n}`);
    }
    assert.equal(rhs,lhs,`${seed} tick ${step} ${type}: source+renewal = current+transit+spent+consumed+lost, ${JSON.stringify(parts)}`);
  }
  for(const node of game.foraging.nodes) {
    assert.ok(Number.isSafeInteger(node.amount)&&node.amount>=0&&node.amount<=node.maxAmount,
      `${seed} tick ${step} node ${node.id} overflow`);
    assert.ok(Number.isSafeInteger(node.reserved)&&node.reserved>=0&&node.reserved<=node.amount,
      `${seed} tick ${step} node ${node.id} reservation`);
    assert.ok(Number.isFinite(node.regrowthProgress)&&node.regrowthProgress>=0&&node.regrowthProgress<1);
  }
  for(const ant of game.colony.workers)
    assert.equal(isWalkable(game.world.layers[ant.layer],ant.x,ant.y),true,`${seed} tick ${step} invalid ant position`);
}
const baseline = game=>Object.fromEntries(RESOURCE_TYPES.map(t=>
  [t,game.foraging.nodes.filter(n=>n.type===t).reduce((s,n)=>s+n.amount,0)]));
test('NEXT-INT-01 real Game shares authoritative live nodes across ecology, foraging, visuals and selection',()=>{
  const g=newGame('joint-single-reference');
  assert.equal(g.ecology.world,g.world);
  assert.strictEqual(g.foraging.nodes,g.world.resources);
  assert.equal(g.ecology.regenerated.water,0);
  assert.ok(g.world.resources.every(n=>n.maxAmount===n.initialAmount && n.regrowthProgress===0));
  assert.equal(g.ecology.tick instanceof Function,true);
  g.colony.setForageSlots(0);
  const node=g.foraging.nodes.find(n=>n.type==='water');
  assert.ok(node);
  node.amount=0;node.reserved=0;
  g.update(100);
  assert.ok(node.regrowthProgress>0,'resource progression is live in Game');
  g.setSpeed(0);const snap=JSON.stringify({sources:g.world.resources,regen:g.ecology.regenerated});
  for(let i=0;i<350;i++)g.update(100);
  assert.equal(JSON.stringify({sources:g.world.resources,regen:g.ecology.regenerated}),snap);
  g.setSpeed(1);
  for(let i=0;i<RESOURCE_REGROWTH_TICKS.water-1;i++)g.update(100);
  assert.equal(node.amount,1,'only naturally renewed source has increased');
  assert.equal(g.ecology.regenerated.water,1);
  assert.equal(node.regrowthProgress,0);
});
test('NEXT-INT-02 real foragers return after exhaustion and recovery, with no instant cache generation',()=>{
  const g=newGame('source-restart');
  const original=baseline(g);
  g.colony.setForageSlots(0);
  // Empty sites deliberately for this fixture, journal the removal explicitly.
  const removed={carbs:0,protein:0,water:0};
  for(const n of g.world.resources){removed[n.type]+=n.amount;n.amount=0;n.reserved=0;}
  for(let i=0;i<200;i++)g.update(100);
  assert.equal(g.foraging.delivered,0);
  assert.deepEqual(g.foraging.inventory,{carbs:0,protein:0,water:0});
  assert.ok(g.world.resources.every(n=>n.amount===0));
  g.colony.setForageSlots(2);
  // Ecology restores actual *surface* sources first; worker must still travel
  // to the site and physically deposit to a reachable underground store.
  let sawSource=false,carried=false,delivered=false;
  for(let i=0;i<3000;i++){
    g.update(100);
    if(g.ecology.regenerated.water>0)sawSource=true;
    if(g.colony.workers.some(w=>w.cargo?.amount>0))carried=true;
    if(g.foraging.delivered>0){delivered=true;break;}
  }
  assert.ok(sawSource && carried && delivered,'physical collection after regrowth must resume');
  assert.ok(g.foraging.completedTrips>0);
  assert.ok(g.ecology.regenerated.water>0);
  // Explicitly removed fixture units + natural regeneration must still balance.
  const base=Object.fromEntries(RESOURCE_TYPES.map(t=>[t,original[t]-removed[t]]));
  audit(g,base,'source-restart',g.clock.ticks);
});
test('NEXT-INT-03 speed multiplier advances ecology on fixed tick only; x0 freezes it',()=>{
  const g=newGame('fixed-step-ecology'),water=g.world.resources.find(n=>n.type==='water');
  g.colony.setForageSlots(0);
  water.amount=0;
  g.setSpeed(0);
  for(let i=0;i<400;i++)g.update(100);
  assert.equal(water.amount,0);assert.equal(water.regrowthProgress,0);
  const start=g.clock.ticks;
  g.setSpeed(2);
  for(let i=0;i<100;i++)g.update(100);
  assert.equal(g.clock.ticks-start,200);
  assert.equal(water.amount,0);
  assert.ok(water.regrowthProgress>.66 && water.regrowthProgress<.67);
  g.setSpeed(4);
  for(let i=0;i<25;i++)g.update(100);
  assert.equal(g.clock.ticks-start,300);
  assert.equal(water.amount,1);
  assert.equal(water.regrowthProgress,0);
  assert.equal(g.ecology.regenerated.water,1);
});
test('NEXT-INT-04 30,000-tick multi-seed integrated colony economy conserves each nutrient',()=>{
  for(const seed of ['NEXT01-colony-01','NEXT01-colony-02','NEXT01-colony-03']) {
    const game=newGame(seed),origin=baseline(game);
    audit(game,origin,seed,0);
    // Advance physically: ant travel, queen reproduction, death, combat and
    // regeneration share the same fixed simulation time. Check intermediate
    // states, not just final totals, to catch transient duplicate reservations.
    for(let i=1;i<=30000;i++){
      game.update(100);
      if(i%197===0 || i===30000) audit(game,origin,seed,i);
    }
    for(const type of RESOURCE_TYPES){
      assert.ok(game.ecology.regenerated[type]>0,`${seed}: ecology failed to renew ${type}`);
    }
    assert.ok(game.foraging.completedTrips>0,`${seed}: no physical delivery`);
    assert.equal(game.clock.ticks,30000);
    audit(game,origin,seed,30000);
  }
});
