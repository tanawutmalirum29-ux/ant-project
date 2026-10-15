import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { makeGameView, UIRenovationAdapter } from '../src/ui/renovation/ui-adapter.js';

test('G3 map snapshot copies legacy drag, selected rectangle, room preview and authoritative picker', () => {
  const game=new Game('G3-CANVAS');
  const ui={game,tool:'dig',selection:null,selectedAntId:null,
    digPreview:{from:{x:1,y:2},to:{x:5,y:6}},
    digSelection:{from:{x:2,y:3},to:{x:4,y:5}},
    roomPreview:{from:{x:3,y:4},to:{x:7,y:7},dragging:true},
    renderer:{canvas:{ownerDocument:{getElementById:id=>id==='room-type'?{value:'nursery'}:null}}}
  };
  const canvas=makeGameView(game,ui,{}).rooms.canvas;
  assert.deepEqual(canvas.digSelection,{from:{x:2,y:3},to:{x:4,y:5}});
  assert.equal(canvas.roomPreview.dragging,true);
  assert.equal(canvas.roomType,'nursery');
  canvas.digSelection.from.x=999;
  canvas.roomPreview.to.x=888;
  assert.equal(ui.digSelection.from.x,2);
  assert.equal(ui.roomPreview.to.x,7);
});

test('G3 map facade updates one existing room picker and commits selected dig only once', () => {
  const picker={value:'nursery',options:[{value:'nursery'},{value:'rest'}],events:[],
    dispatchEvent(event){this.events.push(event.type);}};
  const doc={getElementById:id=>id==='room-type'?picker:null,
    defaultView:{Event:class {constructor(type){this.type=type;}}}};
  const ui={renderer:{canvas:{ownerDocument:doc}},digSelection:null,commitCount:0,clearCount:0,
    clearDigSelection(){this.digSelection=null;this.clearCount++;},
    applyDigSelection(cancel){this.commitCount++;this.digSelection=null;return cancel?{cancelled:3}:{added:3};}
  };
  const adapter=new UIRenovationAdapter({ui,overlay:{}});
  assert.equal(adapter.actions.selectRoomType('invalid').ok,false);
  assert.equal(adapter.actions.selectRoomType('rest').ok,true);
  assert.equal(picker.value,'rest');
  assert.deepEqual(picker.events,['change']);
  assert.equal(adapter.actions.applySelectedDig(true).ok,false);
  ui.digSelection={from:{x:1,y:1},to:{x:3,y:3}};
  const response=adapter.actions.applySelectedDig(true);
  assert.equal(response.ok,true);
  assert.equal(response.data.cancelled,3);
  assert.equal(ui.commitCount,1);
  assert.equal(adapter.actions.applySelectedDig(false).ok,false);
  assert.equal(ui.commitCount,1);
  ui.digSelection={from:{x:0,y:0},to:{x:0,y:0}};
  assert.equal(adapter.actions.clearDigSelection().ok,true);
  assert.equal(ui.digSelection,null);
  assert.equal(ui.clearCount,1);
  adapter.dispose();
});
