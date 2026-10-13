import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceEcology, RESOURCE_REGROWTH_TICKS } from '../src/core/resource-ecology.js';
import { RESOURCE_TYPES, createResourceNodes } from '../src/world/resources.js';
import { createWorld } from '../src/world/generate.js';
import { FixedStepper, createClock } from '../src/core/time.js';

const FACTORS = Object.freeze({
  clear: Object.freeze({ carbs:1, protein:1, water:1 }),
  rain: Object.freeze({ carbs:1.25, protein:1, water:1.5 }),
  dry: Object.freeze({ carbs:.7, protein:.8, water:.6 })
});
const empty = () => ({ carbs:0, protein:0, water:0 });
const node = (type, amount=0, maxAmount=50, reserved=0, progress=0) =>
  ({id:'mock-'+type,x:3,y:4,type,kind:'mock',amount,initialAmount:maxAmount,
    maxAmount,reserved,distance:4,regrowthProgress:progress});
const weather = (kind='clear') => ({
  kind,
  factors:FACTORS[kind],
  tick(){throw new Error('ResourceEcology must never advance Weather');}
});
const change=(w,kind)=>{ w.kind=kind; w.factors=FACTORS[kind]; };
const run=(e,ticks)=>{for(let i=0;i<ticks;i++)e.tick();};
const close=(actual,expected,detail='')=>
  assert.ok(Math.abs(actual-expected)<1e-11,detail+': '+actual+' != '+expected);
const check=(nodes,eco)=>{
  for(const n of nodes){
    assert.ok(Number.isSafeInteger(n.amount) && n.amount>=0 && n.amount<=n.maxAmount);
    assert.ok(Number.isSafeInteger(n.reserved) && n.reserved>=0 && n.reserved<=n.amount);
    assert.ok(Number.isFinite(n.regrowthProgress) && n.regrowthProgress>=0 && n.regrowthProgress<1);
  }
  for(const type of RESOURCE_TYPES) assert.ok(Number.isSafeInteger(eco.regenerated[type])&&eco.regenerated[type]>=0);
};

test('NEXT-02 clear/rain/dry use exact type-specific rates and fractional progress',()=>{
  for(const [kind,factors] of Object.entries(FACTORS)){
    for(const type of RESOURCE_TYPES){
      const site=node(type),w={resources:[site]},climate=weather(kind);
      const eco=new ResourceEcology(w,climate);
      const rate=RESOURCE_REGROWTH_TICKS[type];
      const first=Math.ceil(rate/factors[type]);
      run(eco,first-1);
      assert.equal(site.amount,0,kind+': '+type+' grows early');
      eco.tick();
      assert.equal(site.amount,1,kind+': '+type+' must grow');
      assert.equal(eco.regenerated[type],1);
      const progress=first*factors[type]/rate-1;
      close(site.regrowthProgress,progress,kind+': '+type+' progress');
      run(eco,3000-first);
      const expected=Math.floor(3000*factors[type]/rate+1e-11);
      assert.equal(site.amount,expected,kind+': '+type+' 3000 ticks');
      assert.equal(eco.regenerated[type],expected);
      close(site.regrowthProgress,3000*factors[type]/rate-expected,kind+': '+type+' final progress');
      check(w.resources,eco);
    }
  }
});

test('NEXT-02 changing factors mid-cycle retains all three fractional portions',()=>{
  const site=node('water'),climate=weather('clear');
  const eco=new ResourceEcology({resources:[site]},climate);
  run(eco,90);close(site.regrowthProgress,.3);
  change(climate,'rain');run(eco,100);close(site.regrowthProgress,.8);
  change(climate,'dry');run(eco,99);
  assert.equal(site.amount,0);
  close(site.regrowthProgress,.998);
  eco.tick();
  assert.equal(site.amount,1);
  assert.equal(eco.regenerated.water,1);
  close(site.regrowthProgress,0);
  change(climate,'clear');run(eco,150);close(site.regrowthProgress,.5);
  change(climate,'rain');run(eco,100);
  assert.equal(site.amount,2);
  close(site.regrowthProgress,0);
});

test('NEXT-02 each resource type reacts to live replacement weather factors, not constructor snapshot',()=>{
  const nodes=RESOURCE_TYPES.map(type=>node(type));
  const climate=weather('clear');
  let reads=0;
  const view={get factors(){reads++;return climate.factors;},tick(){throw Error('do not tick');}};
  const eco=new ResourceEcology({resources:nodes},view);
  eco.tick();
  assert.equal(reads,1,'weather.factors fetched exactly once per ecology tick');
  change(climate,'rain');eco.tick();
  change(climate,'dry');eco.tick();
  for(const n of nodes){
    const expected=(1+FACTORS.rain[n.type]+FACTORS.dry[n.type])/RESOURCE_REGROWTH_TICKS[n.type];
    close(n.regrowthProgress,expected,n.type);
  }
  assert.equal(reads,3);
  assert.deepEqual(eco.regenerated,empty());
  assert.deepEqual(climate.factors,FACTORS.dry);
});

test('NEXT-02 weather is optional: original integer ticks, saved progress and rates unchanged',()=>{
  for(const type of RESOURCE_TYPES){
    const rate=RESOURCE_REGROWTH_TICKS[type],old=node(type,0,3);
    const eco=new ResourceEcology({resources:[old]});
    run(eco,rate-1);assert.equal(old.amount,0);
    assert.equal(old.regrowthProgress,(rate-1)/rate);
    eco.tick();
    assert.equal(old.amount,1);
    assert.equal(old.regrowthProgress,0);
    assert.equal(eco.regenerated[type],1);
    const saved=node(type,0,3,0,.5);
    const restored=new ResourceEcology({resources:[saved]});
    run(restored,rate/2);
    if(rate%2===0)assert.equal(saved.amount,1);
    assert.equal(saved.regrowthProgress,0);
  }
  const legacy=node('water',0,2);
  delete legacy.maxAmount;delete legacy.regrowthProgress;
  const eco=new ResourceEcology({resources:[legacy]},null);
  assert.equal(legacy.maxAmount,2);
  assert.equal(legacy.regrowthProgress,0);
  run(eco,300);
  assert.equal(legacy.amount,1);
});

test('NEXT-02 restore fractional weather progress without resetting pending credit',()=>{
  const saved=node('water',0,3,0,.4375);
  const eco=new ResourceEcology({resources:[saved]},weather('rain'));
  run(eco,112); // 112 * 1.5/300 = .56
  close(saved.regrowthProgress,.9975);
  assert.equal(saved.amount,0);
  eco.tick();
  assert.equal(saved.amount,1);
  close(saved.regrowthProgress,.0025);
  assert.equal(eco.regenerated.water,1);
});

test('NEXT-02 cap, large valid multipliers, and no banked growth while full',()=>{
  const site=node('water',1,3,1),climate=weather();
  const eco=new ResourceEcology({resources:[site]},climate);
  climate.factors=Object.freeze({carbs:1,protein:1,water:1200});
  eco.tick();
  assert.equal(site.amount,3);
  assert.equal(eco.regenerated.water,2,'capacity limits added units');
  assert.equal(site.reserved,1,'ecology never changes worker claims');
  assert.equal(site.regrowthProgress,0,'overflow must not bank while full');
  run(eco,500);
  assert.equal(site.amount,3);
  assert.equal(eco.regenerated.water,2);
  site.amount=2; // external physical harvest
  change(climate,'clear');
  run(eco,299);
  assert.equal(site.amount,2,'former full-site ticks must not bank');
  eco.tick();
  assert.equal(site.amount,3);
  assert.equal(eco.regenerated.water,3);
  assert.equal(site.regrowthProgress,0);
});

test('NEXT-02 source empty / just below cap, weather crossing threshold, immutable node fields',()=>{
  const sites=RESOURCE_TYPES.map(type=>node(type,0,2));
  const before=sites.map(s=>({id:s.id,x:s.x,y:s.y,type:s.type,kind:s.kind,initialAmount:s.initialAmount,distance:s.distance}));
  const climate=weather('rain');
  const eco=new ResourceEcology({resources:sites},climate);
  run(eco,2500);
  for(const s of sites){
    assert.equal(s.amount,2);
    assert.equal(s.regrowthProgress,0);
  }
  change(climate,'dry');
  for(let i=0;i<sites.length;i++)sites[i].amount=1;
  run(eco,200);
  for(let i=0;i<sites.length;i++){
    assert.equal(sites[i].amount,1,sites[i].type+' cannot receive carried full-site credit');
    for(const [k,v] of Object.entries(before[i]))assert.equal(sites[i][k],v,k);
  }
  check(sites,eco);
});

test('NEXT-02 malformed weather values fail before ANY stock/progress mutation',()=>{
  const site=node('carbs');
  const climate=weather('clear'),eco=new ResourceEcology({resources:[site]},climate);
  eco.tick();
  const original={...site},ledger={...eco.regenerated};
  for(const factor of [0,-1,NaN,Infinity,-Infinity,undefined,'1',1e-20,1e8]){
    climate.factors={carbs:1,protein:factor,water:1};
    assert.throws(()=>eco.tick(),RangeError);
    assert.deepEqual(site,original);
    assert.deepEqual(eco.regenerated,ledger);
  }
  change(climate,'rain');
  eco.tick();
  assert.ok(site.regrowthProgress>original.regrowthProgress);
});

test('NEXT-02 FixedStepper controls paused weather ecology ticks; speed scales only fixed steps',()=>{
  const n=node('water'),climate=weather('rain');
  const eco=new ResourceEcology({resources:[n]},climate);
  const clock=createClock();
  const stepper=new FixedStepper(()=>eco.tick(),clock);
  assert.equal(stepper.update(100),1);
  stepper.changeSpeed(0);
  for(let i=0;i<25;i++)assert.equal(stepper.update(100),0);
  assert.equal(clock.ticks,1);
  close(n.regrowthProgress,1.5/300);
  stepper.changeSpeed(2);
  for(let i=0;i<40;i++)assert.equal(stepper.update(100),2);
  stepper.changeSpeed(4);
  for(let i=0;i<40;i++)assert.equal(stepper.update(100),4);
  assert.equal(clock.ticks,241);
  assert.equal(n.amount,1);
  assert.equal(eco.regenerated.water,1);
  close(n.regrowthProgress,.205); // 241 *1.5/300 =1.205
});

test('NEXT-02 weather deterministic 30,000 ticks x three seeded worlds: precise mass ledger',()=>{
  const stages=['clear','rain','dry','rain','clear','dry','clear'];
  function simulate(seed){
    const world=createWorld(seed);
    world.resources=createResourceNodes(world);
    const original=Object.fromEntries(RESOURCE_TYPES.map(t=>[t,
      world.resources.filter(n=>n.type===t).reduce((s,n)=>s+n.amount,0)]));
    const climate=weather('clear');
    const eco=new ResourceEcology(world,climate);
    const cargo=empty(),stored=empty(),consumed=empty(),lost=empty(),held=empty(),spent=empty(),injections=empty();
    for(let tick=1;tick<=30000;tick++){
      if((tick-1)%4800===0)change(climate,stages[Math.floor((tick-1)/4800)]);
      if(tick%19===0){
        const idx=(Math.floor(tick/19)*7+world.seed%world.resources.length)%world.resources.length;
        const n=world.resources[idx];
        const qty=Math.min(3,n.amount-n.reserved);
        if(qty>0){n.amount-=qty;cargo[n.type]+=qty;}
      }
      if(tick%23===0)for(const t of RESOURCE_TYPES){
        const qty=Math.min(2,cargo[t]);cargo[t]-=qty;stored[t]+=qty;
      }
      if(tick%89===0)for(const t of RESOURCE_TYPES){
        const qty=Math.min(1,stored[t]);stored[t]-=qty;consumed[t]+=qty;
      }
      if(tick%139===0)for(const t of RESOURCE_TYPES){
        const qty=Math.min(1,stored[t]);stored[t]-=qty;held[t]+=qty;
      }
      if(tick%173===0)for(const t of RESOURCE_TYPES){
        const qty=Math.min(1,held[t]);held[t]-=qty;spent[t]+=qty;
      }
      if(tick%113===0)for(const n of world.resources)n.reserved=Math.min(2,n.amount);
      if(tick%113===1)for(const n of world.resources)n.reserved=0;
      if(tick%701===0){stored.water+=2;injections.water+=2;}
      eco.tick();
      if(tick%59===0||tick===30000){
        check(world.resources,eco);
        for(const type of RESOURCE_TYPES){
          const sources=world.resources.filter(n=>n.type===type).reduce((s,n)=>s+n.amount,0);
          assert.equal(original[type]+eco.regenerated[type]+injections[type],
            sources+cargo[type]+stored[type]+consumed[type]+lost[type]+held[type]+spent[type],
            seed+': '+type+' tick '+tick);
        }
      }
    }
    return {nodes:world.resources,ledger:eco.regenerated,cargo,stored,consumed,lost,held,spent,injections};
  }
  for(const seed of ['ANT-001','weather-midday','dry-season']){
    const a=simulate(seed),b=simulate(seed);
    assert.deepEqual(a,b,seed+' replay must be deterministic');
    assert.ok(RESOURCE_TYPES.every(type=>a.ledger[type]>0),seed+': every resource type renews');
  }
});
