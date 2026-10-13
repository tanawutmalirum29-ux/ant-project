import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world/generate.js';
import { RESOURCE_TYPES, createResourceNodes } from '../src/world/resources.js';
import { ResourceEcology, RESOURCE_REGROWTH_TICKS } from '../src/core/resource-ecology.js';
import { FixedStepper, createClock } from '../src/core/time.js';

const zero = () => ({ carbs: 0, protein: 0, water: 0 });
const sumSources = world => Object.fromEntries(RESOURCE_TYPES.map(type => [
  type, world.resources.filter(n => n.type === type).reduce((total,n) => total+n.amount,0)
]));
function worldFor(seed='NEXT-01') {
  const world = createWorld(seed);
  world.resources = createResourceNodes(world);
  return world;
}
function unitSite(type, amount=0, maxAmount=3, reserved=0, progress=0) {
  return {id:'fixture-'+type,x:1,y:2,type,kind:'fixture',
    amount,initialAmount:maxAmount,maxAmount,reserved,distance:7,regrowthProgress:progress};
}
function tick(ecology,n) { for(let i=0;i<n;i++) ecology.tick(); }
function validate(world,ecology) {
  for (const node of world.resources) {
    assert.ok(Number.isSafeInteger(node.maxAmount) && node.maxAmount>0);
    assert.ok(Number.isSafeInteger(node.amount) && node.amount>=0 && node.amount<=node.maxAmount);
    assert.ok(Number.isSafeInteger(node.reserved) && node.reserved>=0 && node.reserved<=node.amount);
    assert.ok(Number.isFinite(node.regrowthProgress) && node.regrowthProgress>=0 && node.regrowthProgress<1);
  }
  for (const type of RESOURCE_TYPES) assert.ok(Number.isSafeInteger(ecology.regenerated[type]) && ecology.regenerated[type]>=0);
}

test('NEXT-ECO-01 generated sites keep legacy node fields and add exact initial caps',()=>{
  const keys=['id','x','y','type','kind','amount','initialAmount','reserved','distance','maxAmount','regrowthProgress'];
  for(const seed of ['ANT-001','alpha','x','P1-ECO-01','edge-🍃']) {
    const a=worldFor(seed), b=worldFor(seed);
    assert.deepEqual(a.resources,b.resources);
    const sameArray=a.resources;
    const ecology=new ResourceEcology(a);
    assert.strictEqual(a.resources,sameArray);
    assert.deepEqual(ecology.regenerated,zero());
    for(const node of a.resources) {
      for(const key of keys) assert.ok(Object.hasOwn(node,key),seed+': '+key);
      assert.deepEqual(Object.keys(node).sort(),keys.slice().sort());
      assert.equal(node.initialAmount,node.maxAmount);
      assert.ok(node.maxAmount>0);
      assert.equal(node.regrowthProgress,0);
    }
    validate(a,ecology);
  }
});

test('NEXT-ECO-02 exact distinct rate per type; empty sites grow one physical unit, never stock',()=>{
  assert.equal(new Set(Object.values(RESOURCE_REGROWTH_TICKS)).size,3);
  assert.deepEqual(RESOURCE_REGROWTH_TICKS,{carbs:420,protein:900,water:300});
  for(const type of RESOURCE_TYPES) {
    const node=unitSite(type,0,3);
    const world={resources:[node]}, ecology=new ResourceEcology(world);
    const original=node;
    const rate=RESOURCE_REGROWTH_TICKS[type];
    tick(ecology,rate-1);
    assert.equal(node.amount,0);
    assert.equal(ecology.regenerated[type],0);
    assert.ok(node.regrowthProgress>0 && node.regrowthProgress<1);
    ecology.tick();
    assert.strictEqual(world.resources[0],original);
    assert.equal(node.amount,1);
    assert.equal(node.regrowthProgress,0);
    assert.equal(ecology.regenerated[type],1);
    assert.deepEqual(RESOURCE_TYPES.filter(t=>t!==type).map(t=>ecology.regenerated[t]),[0,0]);
  }
});

test('NEXT-ECO-03 capacity is absolute, no saved full-site credit; reservations untouched',()=>{
  const node=unitSite('water',2,3,1);
  const w={resources:[node]},eco=new ResourceEcology(w);
  const snapshot={id:node.id,x:node.x,y:node.y,type:node.type,kind:node.kind,
    distance:node.distance,initialAmount:node.initialAmount,reserved:node.reserved};
  tick(eco,RESOURCE_REGROWTH_TICKS.water*8);
  assert.equal(node.amount,3);
  assert.equal(eco.regenerated.water,1);
  assert.equal(node.regrowthProgress,0);
  for(const [key,value] of Object.entries(snapshot))assert.equal(node[key],value,key);
  node.amount=2; // A real harvest happens in Foraging, outside ecology.
  tick(eco,RESOURCE_REGROWTH_TICKS.water-1);
  assert.equal(node.amount,2,'full nodes cannot bank progress for a future harvest');
  assert.equal(eco.regenerated.water,1);
  eco.tick();
  assert.equal(node.amount,3);
  assert.equal(eco.regenerated.water,2);
  validate(w,eco);
});

test('NEXT-ECO-04 stable fractional projection and restoration of pending progress',()=>{
  const node=unitSite('carbs',0,2);
  const w={resources:[node]}; let eco=new ResourceEcology(w);
  tick(eco,210);
  assert.equal(node.regrowthProgress,.5);
  const restored={resources:[{...node}]};
  eco=new ResourceEcology(restored);
  tick(eco,209);
  assert.equal(restored.resources[0].amount,0);
  eco.tick();
  assert.equal(restored.resources[0].amount,1);
  assert.equal(restored.resources[0].regrowthProgress,0);
  assert.equal(eco.regenerated.carbs,1);
});

test('NEXT-ECO-05 game fixed stepper advances only during active simulation; x2/x4 preserve ticks',()=>{
  const w={resources:[unitSite('water',0,4)]}, ecology=new ResourceEcology(w);
  const clock=createClock(),stepper=new FixedStepper(()=>ecology.tick(),clock);
  assert.equal(stepper.update(100),1);
  stepper.changeSpeed(0);
  for(let i=0;i<500;i++) assert.equal(stepper.update(100),0);
  assert.equal(clock.ticks,1);
  assert.equal(ecology.regenerated.water,0);
  assert.equal(w.resources[0].regrowthProgress,1/RESOURCE_REGROWTH_TICKS.water);
  stepper.changeSpeed(2);
  for(let i=0;i<100;i++)assert.equal(stepper.update(100),2);
  stepper.changeSpeed(4);
  for(let i=0;i<25;i++)assert.equal(stepper.update(100),4);
  assert.equal(clock.ticks,301);
  assert.equal(ecology.regenerated.water,1);
  assert.equal(w.resources[0].amount,1);
});

test('NEXT-ECO-06 malformed sites fail closed instead of creating phantom capacity or amounts',()=>{
  for(const bad of [
    unitSite('carbs',-1,3),unitSite('protein',4,3),
    unitSite('water',0,0),unitSite('water',2,3,3),
    unitSite('water',0,3,0,1),unitSite('carbs',0.5,3),
    {...unitSite('water',0,3),type:'unknown'},
    {...unitSite('water',0,3),maxAmount:null,initialAmount:0}
  ]) assert.throws(()=>new ResourceEcology({resources:[bad]}));
  assert.throws(()=>new ResourceEcology({}),TypeError);
  // Earlier world fixtures can still supply a valid positive initialAmount.
  const old=unitSite('carbs',2,3);delete old.maxAmount;delete old.regrowthProgress;
  const e=new ResourceEcology({resources:[old]});
  assert.equal(old.maxAmount,3);assert.equal(old.regrowthProgress,0);
  assert.equal(e.regenerated.carbs,0);
});

test('NEXT-ECO-07 30,000 ticks across seeds: deterministic physical movements and exact per-type mass accounting',()=>{
  function simulate(seed) {
    const w=worldFor(seed),before=sumSources(w),eco=new ResourceEcology(w);
    const cargo=zero(),stored=zero(),consumed=zero(),injections=zero(),lost=zero();
    for(let n=1;n<=30000;n++) {
      if(n%19===0) {
        const node=w.resources[(Math.floor(n/19)*7)%w.resources.length];
        const q=Math.min(3,node.amount-node.reserved);
        if(q>0){node.amount-=q;cargo[node.type]+=q;} // physical pickup
      }
      if(n%23===0)for(const type of RESOURCE_TYPES) {
        const q=Math.min(2,cargo[type]);cargo[type]-=q;stored[type]+=q; // delivery
      }
      if(n%89===0)for(const type of RESOURCE_TYPES) {
        const q=Math.min(1,stored[type]);stored[type]-=q;consumed[type]+=q; // consumption
      }
      if(n%113===0) {
        const node=w.resources[(Math.floor(n/113)*3)%w.resources.length];
        node.reserved=Math.min(2,node.amount); // reservation is a claim, not physical mass
      }
      if(n%113===1) for(const node of w.resources)node.reserved=0;
      if(n%701===0) {stored.water+=2;injections.water+=2;} // explicit test injection
      eco.tick();
      if(n%37===0 || n===30000) {
        validate(w,eco);
        const sources=sumSources(w);
        for(const type of RESOURCE_TYPES) {
          assert.equal(before[type]+eco.regenerated[type]+injections[type],
            sources[type]+cargo[type]+stored[type]+consumed[type]+lost[type],
            seed+': '+type+' tick '+n);
        }
      }
    }
    return {nodes:w.resources,regenerated:eco.regenerated,cargo,stored,consumed,injections,lost};
  }
  for(const seed of ['ANT-001','renewable-river','long-run-dry']) {
    const a=simulate(seed),b=simulate(seed);
    assert.deepEqual(a,b,seed+' must exactly replay');
    assert.ok(RESOURCE_TYPES.every(type=>a.regenerated[type]>0),seed+' must renew all nutrients');
  }
});
