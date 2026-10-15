import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game.js';
import { UIOverlayController, UI_REGIONS, UI_STACK } from '../src/ui/renovation/shell.js';
import { UIRenovationAdapter, makeGameView } from '../src/ui/renovation/ui-adapter.js';
import { roomPlan } from '../src/core/rooms.js';

class NodeFake {
  constructor(){this.hidden=true;this.isConnected=true;this.attributes={};this.focused=0;}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  focus(){this.focused++;}
}
class DocumentFake {
  listeners=new Map();activeElement=null;
  addEventListener(n,fn){this.listeners.set(n,fn);}
  removeEventListener(n){this.listeners.delete(n);}
}

test('G1 shell names and render order enforce one command region, no layer footer',()=>{
 assert.deepEqual(UI_REGIONS,[
  'HUD_TOP','PRIMARY_COMMAND','MAP_VIEWPORT','MAP_ACTION',
  'CONTEXT_INSPECTOR','PRIMARY_SHEET','MODAL','TOAST','DEV_ONLY']);
 assert.ok(!UI_REGIONS.includes('LAYER_NAV'));
 assert.equal(UI_STACK.MODAL,60);
 const css=readFileSync(new URL('../src/ui/renovation/shell.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\[hidden\]\{display:none!important;/);
});

test('G1 overlay closing popover then sheet, modal exclusion and focus restoration',()=>{
 const doc=new DocumentFake(),owner=new NodeFake();
 doc.activeElement=owner;
 const ctrl=new UIOverlayController({document:doc});
 const sheet=new NodeFake(),popup=new NodeFake(),modal=new NodeFake();
 const endSheet=ctrl.registerPanel('sheet',{element:sheet,kind:'sheet'});
 ctrl.registerPanel('popup',{element:popup,kind:'popover'});
 ctrl.registerPanel('modal',{element:modal,kind:'modal'});
 assert.deepEqual(ctrl.openPanel('sheet'),{ok:true});
 assert.equal(sheet.hidden,false);
 assert.equal(ctrl.openPanel('popup').ok,true);
 const escape={key:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};
 doc.listeners.get('keydown')(escape);
 assert.equal(escape.defaultPrevented,true);
 assert.equal(ctrl.isOpen('popup'),false);
 assert.equal(ctrl.isOpen('sheet'),true);
 assert.equal(ctrl.openPanel('modal').ok,true);
 assert.equal(ctrl.isOpen('sheet'),false);
 assert.equal(ctrl.isOpen('modal'),true);
 assert.equal(ctrl.openPanel('popup').ok,false);
 assert.equal(ctrl.closeTop(),true);
 assert.equal(owner.focused,1);
 endSheet();
 ctrl.dispose();assert.equal(doc.listeners.has('keydown'),false);
});

test('G1 read-only view uses real per-level combat maxHP and dynamic room capacity',()=>{
 const g=new Game('G1-AUDIT');
 const a=g.colony.workers[0];
 a.profession='soldier';a.combatRole='soldier';a.level=3;a.combatHP=19;a.squadId='B';
 const fakeUI={game:g,tool:'inspect',selection:null,selectedAntId:null,nurseryRoomId:null};
 const snapshot=makeGameView(g,fakeUI,{selectedSquad:'B',targeting:false});
 const soldier=snapshot.ants.workers.find(w=>w.id===a.id);
 assert.equal(soldier.maxHP,22);
 assert.equal(soldier.hp,19);
 assert.equal(soldier.squadId,'B');
 assert.equal(snapshot.military.squads.length,2);
 assert.equal(roomPlan('nursery',2,2).broodSlots,4);
 assert.equal(roomPlan('nursery',8,8).broodSlots,16);
 assert.equal(snapshot.rooms.limits.maxWidth,8);
 assert.equal(snapshot.nursery.maxPopulation,150);
 assert.equal(Object.prototype.hasOwnProperty.call(snapshot.military.squads[0],'hpMax'),true);
});

test('G1 action adapter prevents reset before confirmation, and invalid operations cannot change game',()=>{
 let game=new Game('G1-ORIGINAL'),resetCount=0;
 const ui={game,tool:'inspect',selection:null,selectedAntId:null,nurseryRoomId:null,
  switchLayer(layer){this.game.setLayer(layer);},
  setTool(t){this.tool=t;},
  changeSpeed(t){this.game.setSpeed(t);},
  setToolCalls:0,
  select(x){this.selection=x;},
  updateWorld(){},
  onNewWorld(seed){resetCount++;game=new Game(seed);this.game=game;}
 };
 const overlay={setWorldMode:()=>{},closeAll:()=>{}};
 const adapter=new UIRenovationAdapter({ui,overlay});
 const original=ui.game;
 assert.equal(adapter.actions.switchLayer('bogus').ok,false);
 assert.strictEqual(ui.game,original);
 assert.equal(adapter.actions.setTool('dig').ok,true);
 assert.equal(adapter.actions.setSpeed(17).ok,false);
 assert.equal(adapter.actions.confirmWorldReset(1).ok,false);
 assert.equal(adapter.actions.requestWorldReset(' ').ok,false);
 const req=adapter.actions.requestWorldReset('G1-NEW');
 assert.equal(req.requiresConfirmation,true);
 adapter.actions.cancelWorldReset();
 assert.equal(adapter.actions.confirmWorldReset(req.token).ok,false);
 assert.strictEqual(ui.game,original);
 const req2=adapter.actions.requestWorldReset('G1-NEW');
 assert.equal(adapter.actions.confirmWorldReset(req2.token).ok,true);
 assert.equal(resetCount,1);
 assert.equal(ui.game.world.seedLabel,'G1-NEW');
 assert.equal(ui.tool,'inspect');
 assert.equal(adapter.actions.confirmWorldReset(req2.token).ok,false);
 adapter.dispose();
});

test('G1 integration wired but old HUD remains active until coordinator migration',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/createRenovationShell\(\)/);
 assert.match(main,/new UIRenovationAdapter/);
 assert.match(main,/renovationAdapter\.notify\(\)/);
 assert.match(html,/src\/ui\/renovation\/shell\.css/);
 assert.match(html,/id="surface-button"/);
 assert.match(html,/id="underground-button"/);
 const shell=readFileSync(new URL('../src/ui/renovation/shell.js',import.meta.url),'utf8');
 assert.match(shell,/root.hidden=true/);
 assert.match(shell,/feature\.mount\(container/);
});
