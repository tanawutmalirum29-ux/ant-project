import test from 'node:test';
import assert from 'node:assert/strict';
import { Weather, WEATHER_PHASE_TICKS, WEATHER_FACTORS } from '../src/core/weather.js';
import { FixedStepper, createClock } from '../src/core/time.js';

const kinds = new Set(['clear','rain','dry']);
const expectedFactors = {
  clear: { carbs:1, protein:1, water:1 },
  rain: { carbs:1.25, protein:1, water:1.5 },
  dry: { carbs:0.7, protein:0.8, water:0.6 }
};
const advance = (weather, count) => { for (let i=0;i<count;i++) weather.tick(); };
const state = w => ({kind:w.kind,remainingTicks:w.remainingTicks,factors:w.factors});

test('WEATHER-01 initial clear phase has 4800 ticks and exact public contract', () => {
  const weather = new Weather({seed:123});
  assert.equal(WEATHER_PHASE_TICKS,4800);
  assert.deepEqual(state(weather),{kind:'clear',remainingTicks:4800,factors:expectedFactors.clear});
  assert.equal(typeof weather.tick,'function');
  assert.ok(Number.isInteger(weather.remainingTicks));
});

test('WEATHER-02 exact countdown and atomic boundary: no off-by-one or invisible repeat', () => {
  const weather = new Weather({seed:714});
  for (let phase=0;phase<12;phase++) {
    const previous=weather.kind;
    assert.equal(weather.remainingTicks,WEATHER_PHASE_TICKS);
    advance(weather,WEATHER_PHASE_TICKS-1);
    assert.equal(weather.kind,previous);
    assert.equal(weather.remainingTicks,1);
    weather.tick();
    assert.ok(kinds.has(weather.kind));
    assert.notEqual(weather.kind,previous,'every new phase must have a different kind');
    assert.equal(weather.remainingTicks,WEATHER_PHASE_TICKS);
  }
});

test('WEATHER-03 reproducible sequences for same seed; distinct seeds eventually diverge', () => {
  function sequence(seed) {
    const weather = new Weather({seed});
    const phases=[weather.kind];
    for(let i=0;i<32;i++) {
      advance(weather,WEATHER_PHASE_TICKS);
      phases.push(weather.kind);
    }
    return phases;
  }
  for (const seed of [0,1,2,714,987654321,0xffffffff]) {
    assert.deepEqual(sequence(seed),sequence(seed),'same seed must replay exactly');
  }
  assert.notDeepEqual(sequence(0),sequence(1),'different seed must eventually change the phase sequence');
  assert.notDeepEqual(sequence(714),sequence(987654321));
});

test('WEATHER-04 immutable/read-only factors and agreed strictly positive multipliers', () => {
  assert.ok(Object.isFrozen(WEATHER_FACTORS));
  for(const kind of kinds) {
    const factors=WEATHER_FACTORS[kind];
    assert.ok(Object.isFrozen(factors),kind);
    assert.deepEqual(factors,expectedFactors[kind]);
    for(const type of ['carbs','protein','water']) {
      assert.ok(Number.isFinite(factors[type]) && factors[type]>0);
    }
    assert.throws(()=>{ factors.water=-1; },TypeError);
  }
  const weather = new Weather({seed:44});
  assert.strictEqual(weather.factors,WEATHER_FACTORS.clear);
  assert.throws(()=>{ weather.kind='rain'; },TypeError);
  assert.throws(()=>{ weather.remainingTicks=10; },TypeError);
  assert.throws(()=>{ weather.factors={water:10}; },TypeError);
  assert.strictEqual(weather.factors,WEATHER_FACTORS.clear);
  advance(weather,WEATHER_PHASE_TICKS);
  assert.strictEqual(weather.factors,WEATHER_FACTORS[weather.kind]);
});

test('WEATHER-05 30,000+ fixed ticks across seeds: exact remainingTicks and no repeated phases', () => {
  for(const seed of [17,38401,4294967295]) {
    const weather=new Weather({seed});
    let lastPhaseKind=weather.kind;
    const seen = new Set([weather.kind]);
    for(let n=1;n<=35000;n++) {
      weather.tick();
      const rem = n % WEATHER_PHASE_TICKS;
      assert.equal(weather.remainingTicks,rem===0?WEATHER_PHASE_TICKS:WEATHER_PHASE_TICKS-rem);
      assert.ok(Number.isInteger(weather.remainingTicks));
      assert.ok(weather.remainingTicks>0 && weather.remainingTicks<=WEATHER_PHASE_TICKS);
      assert.ok(kinds.has(weather.kind));
      assert.strictEqual(weather.factors,WEATHER_FACTORS[weather.kind]);
      if(rem===0) {
        assert.notEqual(weather.kind,lastPhaseKind,'repeat at tick '+n+' seed='+seed);
        lastPhaseKind=weather.kind;
        seen.add(weather.kind);
      }
    }
    assert.ok(seen.size>=2);
  }
});

test('WEATHER-06 fixed stepper pause freezes kind/countdown; x2/x4 only change step count', () => {
  const weather=new Weather({seed:54321}),clock=createClock();
  const stepper=new FixedStepper(()=>weather.tick(),clock);
  advance(weather,4700);
  const before=state(weather);
  stepper.changeSpeed(0);
  for(let i=0;i<300;i++)assert.equal(stepper.update(100),0);
  assert.deepEqual(state(weather),before);
  assert.equal(clock.ticks,0);
  stepper.changeSpeed(2);
  for(let i=0;i<40;i++)assert.equal(stepper.update(100),2);
  assert.equal(weather.remainingTicks,20);
  stepper.changeSpeed(4);
  for(let i=0;i<5;i++)assert.equal(stepper.update(100),4);
  assert.notEqual(weather.kind,'clear');
  assert.equal(weather.remainingTicks,WEATHER_PHASE_TICKS);
  assert.equal(clock.ticks,100);
  stepper.changeSpeed(0);
  const paused=state(weather);
  for(let i=0;i<200;i++)stepper.update(250);
  assert.deepEqual(state(weather),paused);
});

test('WEATHER-07 world, resources and ecology state are never modified by the weather engine', () => {
  const resources=Object.freeze([{id:'source-a',type:'water',amount:4,maxAmount:9,regrowthProgress:0.25}].map(Object.freeze));
  const world=Object.freeze({seed:4821,resources,layers:Object.freeze({})});
  const original=JSON.stringify(world);
  const weather=new Weather(world);
  advance(weather,WEATHER_PHASE_TICKS*13+17);
  assert.equal(JSON.stringify(world),original);
  assert.equal(weather.remainingTicks,WEATHER_PHASE_TICKS-17);
  assert.equal(weather.factors.water,expectedFactors[weather.kind].water);
});

test('WEATHER-08 input validation rejects missing, non-integer or out-of-range world seeds', () => {
  for(const world of [null,undefined,{}, {seed:'1'},{seed:NaN},{seed:Infinity},
    {seed:-1},{seed:1.5},{seed:0x100000000}]) {
    assert.throws(()=>new Weather(world),TypeError);
  }
  assert.equal(new Weather({seed:0}).kind,'clear');
  assert.equal(new Weather({seed:0xffffffff}).kind,'clear');
});
