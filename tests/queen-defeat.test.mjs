import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/core/game.js';
import {LIFE} from '../src/core/lifecycle.js';
import {SURFACE, UNDERGROUND} from '../src/world/generate.js';
import {FixedStepper, createClock} from '../src/core/time.js';

test('terminal queen death freezes all remaining accumulated fixed ticks at exact defeat tick',()=>{
  const g=new Game('defeat-one-tick');
  g.setSpeed(4);
  g.onTick(()=>{g.colony.queen.alive=false;g.combat.queenHP=0;});
  assert.equal(g.update(250),1,'must not run subsequent pending x4 ticks');
  assert.equal(g.clock.ticks,1);
  assert.equal(g.clock.speed,0);
  assert.equal(g.defeat.cause,'combat');
  assert.equal(g.defeat.tick,1);
  assert.equal(g.update(250),0);
  g.setSpeed(4);
  assert.equal(g.clock.speed,0,'no speed button may resume a defeated colony');
  assert.equal(g.update(250),0);
  assert.equal(g.clock.ticks,1);
  assert.strictEqual(g.recordDefeat(),g.defeat,'result must be recorded exactly once');
});

test('real hostile attack causes authoritative game defeat and freeze',()=>{
  const g=new Game('hostile-defeat');
  // Bring queen below the damage of ONE REAL combat attack rather than killing
  // her by hand. Move nearby starter workers away so enemy hits the queen.
  for(const w of g.colony.workers){w.layer=SURFACE;w.x=0;w.y=0;}
  g.combat.soldierSlots=0;
  g.combat.queenHP=1;
  const q=g.colony.queen;
  const enemy=g.combat.spawn('beetle',UNDERGROUND,q.x,q.y+1);
  assert.ok(enemy);
  g.setSpeed(4);
  assert.equal(g.update(250),1);
  assert.equal(q.alive,false);
  assert.equal(g.defeat?.cause,'combat');
  assert.equal(g.defeat?.reason,'นางพญาถูกศัตรูโจมตีจนสิ้นชีวิต');
  assert.equal(g.clock.speed,0);
  assert.equal(g.clock.ticks,1);
});

test('natural lifespan and starvation produce their own immutable defeat reasons',()=>{
  const old=new Game('old-queen-defeat');
  old.lifecycle.queenHealth.age=LIFE.queenMaxAge-1;
  old.update(100);
  assert.equal(old.defeat?.cause,'age');
  assert.equal(old.clock.speed,0);
  const starving=new Game('starving-queen-defeat');
  starving.lifecycle.queenHealth.hunger=LIFE.queenStarve;
  starving.foraging.inventory.carbs=0;
  starving.update(100);
  assert.equal(starving.defeat?.cause,'starvation');
  assert.equal(starving.clock.speed,0);
  const fresh=new Game('starving-queen-defeat');
  assert.equal(fresh.defeat,null);
  assert.equal(fresh.clock.speed,1);
  assert.equal(fresh.update(100),1);
});

test('fixed stepper can pause inside its callback without running queued substeps',()=>{
  const clock=createClock();
  let steps=0;
  let stepper;
  stepper=new FixedStepper(()=>{steps++;stepper.changeSpeed(0);},clock);
  stepper.changeSpeed(4);
  assert.equal(stepper.update(250),1);
  assert.equal(clock.ticks,1);
  assert.equal(steps,1);
  assert.equal(stepper.accumulator,0);
});
