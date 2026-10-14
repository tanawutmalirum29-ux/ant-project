import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatControls } from '../src/ui/combat-controls.js';
import { Game } from '../src/core/game.js';
import { Renderer } from '../src/render/renderer.js';
import { unitPose, snapshotPositions, displayedPosition } from '../src/core/game.js';
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

/** Drive real CombatControls methods without requiring a browser or coupling to source syntax. */
function rallyHarness({ squad='A', accepted=true }={}) {
  const pings=[],commands=[],notices=[],reports=[],attributes=[];
  const workerA={id:'worker-1',combatRole:'soldier',combatHP:16};
  const workerB={id:'worker-2',combatRole:'soldier',combatHP:14};
  const members={A:[workerA],B:[workerB]};
  const snapshot=id=>({id,count:members[id].length,
    soldiers:members[id].map(w=>({id:w.id,hp:w.combatHP,maxHP:16,layer:UNDERGROUND,
      x:2,y:3,state:'combat-guard',formationStatus:null,arrived:false})),
    mode:'defend',rally:null,hpCurrent:members[id][0].combatHP,hpMax:16,ralliedCount:0,
    formation:{assigned:0,standby:0,unreachable:0},queenEmergency:false});
  const combat={
    soldiers:[workerA,workerB],mode:'defend',rally:null,
    getSquads(){return {ok:true,data:['A','B'].map(snapshot)};},
    getSquad(id){return {ok:true,data:snapshot(id)};},
    setSquadRally(id,layer,x,y){
      commands.push([id,layer,x,y]);
      if(!accepted)return {ok:false,error:{code:'UNREACHABLE_RALLY',message:'No traversable path'}};
      return {ok:true,data:{squadId:id,mode:'rally',rally:{layer,x,y}}};
    }
  };
  const game={combat,layer:UNDERGROUND};
  const ui={
    game,renderer:{showRallyPing(...args){pings.push(args);}},
    notice(message){notices.push(message);},setTool(){}
  };
  const controls=Object.create(CombatControls.prototype);
  Object.assign(controls,{ui,targeting:false,selectedSquad:squad,
    dialog:{close(){}},tip:{hidden:true},
    report(message){reports.push(message);},update(){}});
  return {controls,game,pings,commands,notices,reports,attributes};
}
function withFakeRallyButton(run){
  const previous=globalThis.document;
  const button={attributes:{},setAttribute(key,value){this.attributes[key]=value;}};
  globalThis.document={getElementById(id){
    assert.equal(id,'u6-quick-rally');
    return button;
  }};
  try{return run(button);}
  finally{
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
}
test('rally arming and cancellation do not create a renderer ping',()=>{
  withFakeRallyButton(button=>{
    const h=rallyHarness();
    assert.equal(h.controls.armRally(),true);
    assert.equal(h.controls.targeting,true);
    assert.equal(h.pings.length,0);
    assert.equal(button.attributes['aria-pressed'],'true');
    h.controls.cancelRally();
    assert.equal(h.controls.targeting,false);
    assert.equal(h.pings.length,0);
    assert.equal(button.attributes['aria-pressed'],'false');
  });
});
test('successful squad-aware rally tap sends the armed squad and creates one ping',()=>{
  withFakeRallyButton(()=>{
    const h=rallyHarness({squad:'A'});
    h.controls.armRally();
    h.controls.selectedSquad='B'; // Changing the visible selection must not retarget the armed command.
    assert.equal(h.controls.placeRally({layer:UNDERGROUND,x:13,y:18}),true);
    assert.deepEqual(h.commands,[['A',UNDERGROUND,13,18]]);
    assert.deepEqual(h.pings,[[h.game,UNDERGROUND,13,18]]);
    assert.equal(h.controls.targeting,false);
    assert.equal(h.pings.length,1);
  });
});
test('squad B rally uses B, and a rejected Result never emits a ping',()=>{
  withFakeRallyButton(()=>{
    const accepted=rallyHarness({squad:'B'});
    accepted.controls.armRally();
    accepted.controls.placeRally({layer:SURFACE,x:10,y:12});
    assert.deepEqual(accepted.commands,[['B',SURFACE,10,12]]);
    assert.equal(accepted.pings.length,1);
    const rejected=rallyHarness({squad:'B',accepted:false});
    rejected.controls.armRally();
    rejected.controls.placeRally({layer:UNDERGROUND,x:7,y:9});
    assert.deepEqual(rejected.commands,[['B',UNDERGROUND,7,9]]);
    assert.equal(rejected.pings.length,0);
    assert.equal(rejected.controls.targeting,true,'failed command remains in targeting mode for retry');
    assert.ok(rejected.notices.length+rejected.reports.length>0,'rejection has visible feedback');
  });
});
test('legacy setRally returns boolean and keeps default-A rally readable',()=>{
  const game=new Game('legacy-rally-v1');
  const point=game.world.entrances[0].underground;
  assert.equal(game.combat.setRally(UNDERGROUND,point.x,point.y),true);
  assert.equal(game.combat.mode,'rally');
  assert.deepEqual(game.combat.rally,{layer:UNDERGROUND,x:point.x,y:point.y});
  assert.equal(game.combat.setRally('invalid-layer',point.x,point.y),false);
  assert.deepEqual(game.combat.rally,{layer:UNDERGROUND,x:point.x,y:point.y});
});
