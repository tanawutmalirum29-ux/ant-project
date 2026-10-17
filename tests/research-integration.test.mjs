import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Research } from '../src/core/research.js';
import { TICK_MS } from '../src/core/time.js';
import { makeGameView, UIRenovationAdapter } from '../src/ui/renovation/ui-adapter.js';

function funded(seed='CP-CEO-LIVE') {
  const game=new Game(seed);
  Object.assign(game.foraging.inventory,{carbs:16,protein:14,water:12});
  game.rooms.syncInventory();
  return game;
}
const uiFor=game=>({game,tool:'inspect',selection:null,selectedAntId:null,
  nurseryRoomId:null,digPreview:null,digSelection:null,roomPreview:null});
test('CP-CEO-01 actual Game owns exactly one wired physical Research and after-combat tick',()=>{
  const g=funded();
  assert.ok(g.research instanceof Research);
  for(const name of ['colony','foraging','rooms','lifecycle','combat'])
    assert.equal(g[name].research,g.research,name+' uses current game research');
  assert.equal(g.lifecycle.combat,g.combat);
  const calls=[];
  g.onTick(()=>calls.push({
    tick:g.clock.ticks,progress:g.research.snapshot().active?.progressTicks
  }));
  assert.deepEqual(g.research.start('foraging_routes'),{ok:true,runId:1});
  assert.deepEqual(g.foraging.inventory,{carbs:10,protein:10,water:9});
  assert.equal(g.update(TICK_MS),1);
  assert.equal(g.clock.ticks,1);
  assert.equal(g.research.snapshot().active.progressTicks,1);
  assert.deepEqual(calls,[{tick:0,progress:1}]);
  assert.equal(g.research.cancel(1).ok,true);
  assert.deepEqual(g.foraging.inventory,{carbs:16,protein:14,water:12});
});
test('CP-CEO-02 real UI Research view is frozen and action facade charges/refunds exactly once',()=>{
  const g=funded('CP-CEO-UI');
  const ui=uiFor(g);
  const adapter=new UIRenovationAdapter({ui,overlay:{setWorldMode(){},closeAll(){}}});
  let seen=0;const off=adapter.subscribe(view=>{
    assert.equal(view.research.technologies.length,6);
    seen++;
  });
  const before=adapter.view.research;
  assert.equal(Object.isFrozen(before.technologies),true);
  assert.equal(Object.isFrozen(before.technologies[0].cost),true);
  assert.equal(before.technologies[0].status,'available');
  assert.equal(adapter.actions.startResearch('foraging_routes').ok,true);
  const underway=adapter.view.research;
  assert.equal(underway.activeResearchId,'foraging_routes');
  assert.equal(underway.technologies[0].status,'active');
  assert.equal(underway.technologies[0].remainingTicks,600);
  assert.equal(underway.technologies[0].canCancel,true);
  assert.deepEqual(underway.refundPreview,{carbs:6,protein:4,water:3});
  assert.equal(adapter.actions.startResearch('foraging_routes').error.code,'RESEARCH_ACTIVE');
  assert.equal(adapter.actions.cancelResearch().ok,true);
  assert.equal(adapter.actions.cancelResearch().error.code,'NO_ACTIVE_RESEARCH');
  assert.equal(adapter.view.research.activeResearchId,null);
  assert.deepEqual(g.foraging.inventory,{carbs:16,protein:14,water:12});
  assert.ok(seen>=4);
  off();adapter.dispose();
});
test('CP-CEO-03 newly constructed world never retains old Research, ownership or buffs',()=>{
  const first=funded('CP-CEO-RESET');
  assert.equal(first.research.start('foraging_routes').ok,true);
  const fresh=new Game('CP-CEO-RESET');
  assert.notEqual(first.research,fresh.research);
  assert.equal(fresh.research.snapshot().active,null);
  assert.deepEqual(fresh.research.snapshot().completedIds,[]);
  assert.deepEqual(fresh.research.held,{carbs:0,protein:0,water:0});
  assert.equal(fresh.foraging.research,fresh.research);
  const facade=makeGameView(fresh,uiFor(fresh),null).research;
  assert.equal(facade.activeResearchId,null);
  assert.equal(facade.technologies[0].canStart,false);
  assert.equal(facade.ticksPerGameSecond,10);
});
test('CP-CEO-04 terminal queen outcome freezes held Research with or without paused simulation',()=>{
  for(const paused of [true,false]){
    const game=funded('CP-CEO-DEFEAT-'+paused);
    game.pauseOnDefeat=paused;
    assert.equal(game.research.start('foraging_routes').ok,true);
    game.update(TICK_MS);
    const progress=game.research.snapshot().active.progressTicks;
    game.colony.queen.alive=false;
    game.update(TICK_MS);
    assert.equal(game.research.snapshot().active.progressTicks,progress);
    assert.equal(game.research.snapshot().refundPreview,null);
    assert.equal(game.research.cancel(1).error.code,'GAME_OVER');
  }
});
