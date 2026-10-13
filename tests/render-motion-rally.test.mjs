import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game.js';
import { Renderer } from '../src/render/renderer.js';
import { unitPose, snapshotPositions, displayedPosition } from '../src/core/render-motion.js';
import { UNDERGROUND, SURFACE } from '../src/world/generate.js';

function scene() {
  const worker = { id:'worker-1', layer:UNDERGROUND, x:4, y:6, next:{x:5,y:6}, motion:.34 };
  const queen = { id:'queen-1', layer:UNDERGROUND, x:10, y:10, next:null };
  const enemy = { id:'enemy-1', layer:SURFACE, x:7, y:8, next:{x:7,y:9}, motion:.23 };
  const game = {
    colony:{queen,workers:[worker]},combat:{enemies:[enemy]},
    clock:{speed:1},stepper:{accumulator:50}
  };
  return {game,worker,queen,enemy};
}

test('render-only interpolation fills 100ms gaps for workers, soldiers and enemies', () => {
  const {game,worker,enemy} = scene();
  const before = snapshotPositions(game);
  worker.motion=.68;enemy.motion=.46;
  const after = snapshotPositions(game);
  game.renderMotion={from:before,to:after};
  assert.ok(Math.abs(displayedPosition(game,worker).x-4.51)<1e-9);
  assert.ok(Math.abs(displayedPosition(game,enemy).y-8.345)<1e-9);
  game.stepper.accumulator=0;
  assert.deepEqual(displayedPosition(game,worker),before.get(worker));
  game.stepper.accumulator=100;
  assert.deepEqual(displayedPosition(game,worker),after.get(worker));
  game.stepper.accumulator=50;
  assert.deepEqual(unitPose(worker),after.get(worker),'presentation does not write to unit');
  assert.equal(worker.motion,.68);
});

test('paused clock renders the latest committed position without drifting', () => {
  const {game,worker} = scene();
  const before = snapshotPositions(game);
  worker.motion=.68;
  game.renderMotion={from:before,to:snapshotPositions(game)};
  game.clock.speed=0;
  game.stepper.accumulator=0;
  assert.deepEqual(displayedPosition(game,worker),unitPose(worker));
});

test('portals and out-of-tick rally changes cannot interpolate through the map', () => {
  const {game,worker} = scene();
  const from = snapshotPositions(game);
  worker.layer=SURFACE;worker.x=70;worker.y=20;worker.next=null;
  game.renderMotion={from,to:snapshotPositions(game)};
  assert.deepEqual(displayedPosition(game,worker),unitPose(worker));
  worker.x=71; // external command / teleport after previous simulation tick
  assert.deepEqual(displayedPosition(game,worker),unitPose(worker));
  const fresh={layer:SURFACE,x:1,y:1,next:null};
  assert.deepEqual(displayedPosition(game,fresh),unitPose(fresh));
});

test('real fixed simulation tick records interpolation snapshots', () => {
  const game = new Game('render-smooth-rally');
  assert.equal(game.renderMotion,null);
  assert.equal(game.update(100),1);
  assert.equal(game.clock.ticks,1);
  const worker=game.colony.workers[0];
  assert.ok(game.renderMotion.from.has(worker));
  assert.ok(game.renderMotion.to.has(worker));
});

function fakeContext() {
  const calls=[];
  return {calls,save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    arc(...args){calls.push(['arc',...args])}};
}

test('rally marker is absent at rest, appears after tap, fades on real time, and expires before arrival', () => {
  const ctx=fakeContext(),renderer=new Renderer({getContext:()=>ctx});
  const game={layer:UNDERGROUND,combat:{soldiers:[],enemies:[],
    rally:{layer:UNDERGROUND,x:13,y:18}}};
  renderer.drawCombat(ctx,game,1000);
  assert.equal(ctx.calls.length,0,'persistent combat.rally must not draw a marker');
  renderer.showRallyPing(game,UNDERGROUND,13,18,1000);
  renderer.drawCombat(ctx,game,1100);
  assert.equal(ctx.calls.length,1,'one ephemeral ring after tap');
  renderer.drawCombat(ctx,game,2499);
  assert.equal(ctx.calls.length,2);
  renderer.drawCombat(ctx,game,2500);
  assert.equal(ctx.calls.length,2,'no marker after 1.5 seconds');
  assert.equal(renderer.rallyPing,null);
  assert.deepEqual(game.combat.rally,{layer:UNDERGROUND,x:13,y:18},
    'soldiers keep their destination after the visual ping disappears');
});

test('marker respects current layer and does not persist across new seed/game', () => {
  const ctx=fakeContext(),renderer=new Renderer({getContext:()=>ctx});
  const game={layer:SURFACE,combat:{soldiers:[],enemies:[]}};
  renderer.showRallyPing(game,UNDERGROUND,10,10,1000);
  renderer.drawCombat(ctx,game,1200);
  assert.equal(ctx.calls.length,0);
  renderer.drawCombat(ctx,{layer:UNDERGROUND,combat:game.combat},1300);
  assert.equal(renderer.rallyPing,null,'do not leak old marker into a new game');
});

test('tap confirmation starts the ping only after the simulation accepts a rally order',()=>{
  const ui=readFileSync(new URL('../src/ui/combat-controls.js',import.meta.url),'utf8');
  assert.match(ui,/if\(this\.combat\.setRally\(tile\.layer,tile\.x,tile\.y\)\)\{\s*this\.ui\.renderer\.showRallyPing/);
  assert.doesNotMatch(ui.slice(ui.indexOf('  armRally(){'),ui.indexOf('  cancelRally(){')),/showRallyPing/);
});
