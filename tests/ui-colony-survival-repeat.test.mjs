import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { UIRenovationAdapter, makeGameView } from '../src/ui/renovation/ui-adapter.js';

function setup() {
  const game=new Game('newborn'),queen=game.colony.queen;
  const room={id:'repeat-ui-a',type:'nursery',x:queen.x-4,y:queen.y,width:2,height:2,
    status:'ready',connected:true,progress:65,ticks:65,cost:{carbs:3,protein:2},
    stock:{carbs:0,protein:0,water:0}};
  game.rooms.rooms.push(room);game.rooms.updateConnectivity();
  assert.equal(room.status,'ready');
  const ui={game,nurseryRoomId:room.id,tool:'inspect',selection:null,
    selectedAntId:null,refreshNursery(){this.refreshed=(this.refreshed||0)+1;}};
  return {game,room,ui};
}
test('Nursery UI snapshot exposes only immutable authoritative repeat fields',()=>{
  const {game,room,ui}=setup();
  const view=makeGameView(game,ui,null);
  assert.equal(view.nursery.rooms[0].repeat.enabled,false);
  const adapter=new UIRenovationAdapter({ui,overlay:{}});
  const answer=adapter.actions.setRepeatOrder(room.id,'soldier',4,true);
  assert.equal(answer.ok,true);
  assert.equal(ui.refreshed,1);
  const armed=adapter.view.nursery.rooms[0].repeat;
  assert.equal(armed.profession,'soldier');
  assert.equal(armed.level,4);
  assert.equal(armed.state,'armed');
  assert.equal(armed.activeOrderId,null);
  assert.equal(Object.isFrozen(armed),true);
  const failed=adapter.actions.setRepeatOrder(room.id,'invalid',3,true);
  assert.equal(failed.ok,false);
  assert.equal(adapter.view.nursery.rooms[0].repeat.profession,'soldier');
  const disabled=adapter.actions.setRepeatOrder(room.id,'soldier',4,false);
  assert.equal(disabled.plan.state,'disabled');
  adapter.dispose();
});
test('new Game/Seed has no stale repeat plans, old snapshot cannot control it',()=>{
  const {game,room,ui}=setup();
  const adapter=new UIRenovationAdapter({ui,overlay:{}});
  assert.equal(adapter.actions.setRepeatOrder(room.id,'forager',2,true).ok,true);
  assert.equal(game.lifecycle.repeatPlans.size,1);
  ui.game=new Game('different-seed');
  assert.equal(ui.game.lifecycle.repeatPlans.size,0);
  assert.equal(adapter.view.nursery.rooms.length,0);
  adapter.dispose();
});
