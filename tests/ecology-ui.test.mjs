import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, resourceVisualState } from '../src/render/renderer.js';
import { UI, resourceSelectionText } from '../src/ui/app.js';
import { SURFACE, TERRAINS } from '../src/world/generate.js';

const full={id:'resource-1',x:1,y:1,type:'carbs',kind:'nectar',amount:20,
  initialAmount:20,reserved:4,distance:8};
function record() {
  const events=[];
  const store={};
  const ctx=new Proxy(store,{
    get(obj,key) {
      if(key==='events')return events;
      if(key in obj)return obj[key];
      return (...args)=>events.push([key,...args]);
    },
    set(obj,key,value){obj[key]=value;events.push([key,value]);return true;}
  });
  return ctx;
}
function draw(nodes,zoom=1,seed=1337) {
  const ctx=record();
  const bounds={x0:0,x1:4,y0:0,y1:4};
  Renderer.prototype.drawResources.call(null,ctx,
    {foraging:{nodes},world:{seed}},bounds,250,zoom);
  return ctx.events;
}

test('NEXT3-01 state adapter is read-only, legacy-compatible and reservation-aware',()=>{
  const before=structuredClone(full);
  assert.deepEqual(resourceVisualState(full),{
    amount:20,capacity:20,reserved:4,available:16,ratio:1,progress:null,status:'abundant'
  });
  assert.deepEqual(full,before,'rendering must never mutate source data');
  const low=resourceVisualState({...full,amount:3,reserved:2,maxAmount:40,regrowthProgress:.725});
  assert.equal(low.capacity,40);
  assert.equal(low.ratio,.075);
  assert.equal(low.available,1);
  assert.equal(low.status,'low');
  assert.equal(low.progress,.725);
  assert.equal(resourceVisualState({...full,amount:2,reserved:4}).available,0);
});

test('NEXT3-02 empty legacy does not imply recovery; ecology zero and partial progress are explicit',()=>{
  const old=resourceVisualState({...full,amount:0});
  assert.equal(old.status,'depleted');
  assert.equal(old.progress,null);
  const renewed=resourceVisualState({...full,amount:0,maxAmount:28,regrowthProgress:0});
  assert.equal(renewed.status,'recovering');
  assert.equal(renewed.progress,0);
  assert.equal(resourceVisualState({...full,amount:0,regrowthProgress:.99}).status,'recovering');
  assert.equal(resourceVisualState({...full,amount:4,regrowthProgress:Infinity}).progress,null);
  assert.equal(resourceVisualState({...full,amount:-3,reserved:-2}).amount,0);
  assert.equal(resourceVisualState({...full,amount:999,maxAmount:20}).ratio,1);
});

test('NEXT3-03 empty resources remain visible, distinct silhouettes for 3 types',()=>{
  for(const type of ['carbs','protein','water']){
    const live=draw([{...full,type}]);
    const empty=draw([{...full,type,amount:0,regrowthProgress:.35}]);
    assert.ok(live.some(e=>e[0]==='translate'),'visible '+type);
    assert.ok(empty.some(e=>e[0]==='translate'),'exhausted source must remain visible '+type);
    assert.ok(empty.some(e=>e[0]==='arc'),'small depleted outline '+type);
    assert.ok(empty.some(e=>e[0]==='stroke'),'regrowth cue '+type);
  }
  const carb=draw([{...full,type:'carbs'}]);
  const insect=draw([{...full,type:'protein'}]);
  const water=draw([{...full,type:'water'}]);
  assert.notDeepEqual(carb,insect);
  assert.notDeepEqual(water,insect);
  assert.notDeepEqual(water,carb);
});

test('NEXT3-04 paint is deterministic, culled, zoom-scaled and seeded',()=>{
  const nodes=[{...full,amount:2,regrowthProgress:.5},
    {...full,id:'outside',x:50,y:50,amount:0,regrowthProgress:.3}];
  assert.deepEqual(draw(nodes,1.3,812),draw(nodes,1.3,812));
  assert.notDeepEqual(draw(nodes,1.3,812),draw(nodes,1.3,813));
  assert.notDeepEqual(draw(nodes,.4,812),draw(nodes,1.3,812));
  assert.ok(draw(nodes,.4,812).length < draw(nodes,1.3,812).length);
  assert.deepEqual(draw([nodes[0]]),draw(nodes),'off-screen node is never painted');
  const ctx=record();
  Renderer.prototype.drawResources.call(null,ctx,{foraging:{nodes:[]},world:{seed:812}},
    {x0:0,x1:4,y0:0,y1:4},0,.5);
  assert.equal(ctx.events.length,0);
});

test('NEXT3-05 compact single-card text is truthful across depleted/renewing/legacy nodes',()=>{
  const old=resourceSelectionText({...full,amount:0});
  assert.match(old.title,/อาหาร/);
  assert.match(old.details,/0\/20/);
  assert.match(old.details,/พร้อมเก็บ 0 · จอง 4/);
  assert.equal(old.note,'หมดแล้ว');
  const recovery=resourceSelectionText({...full,type:'water',amount:0,
    reserved:0,maxAmount:32,regrowthProgress:.66});
  assert.equal(recovery.title,'น้ำ');
  assert.match(recovery.details,/0\/32/);
  assert.match(recovery.note,/ฟื้นหน่วยถัดไป 66%/);
  const low=resourceSelectionText({...full,type:'protein',amount:3,
    reserved:1,maxAmount:40,regrowthProgress:.45});
  assert.match(low.title,/โปรตีน/);
  assert.match(low.details,/พร้อมเก็บ 2/);
  assert.match(low.note,/เหลือน้อย.*45%/);
  assert.equal(resourceSelectionText({...full}).note,'เต็มความจุ');
  assert.ok(resourceSelectionText({...full,maxAmount:30}).note.includes('มีทรัพยากร'));
});

function testLayer() {
  return {width:4,height:4,cells:Uint8Array.from({length:16},()=>TERRAINS.GRASS)};
}
function domStub(){
  const elements=new Map();
  return {
    getElementById(id){
      if(!elements.has(id))elements.set(id,{
        textContent:'',classList:{
          states:new Set(),
          add(name){this.states.add(name);},
          remove(name){this.states.delete(name);},
          toggle(name,on){if(on)this.states.add(name);else this.states.delete(name);},
          contains(name){return this.states.has(name);}
        }
      });
      return elements.get(id);
    }
  };
}

test('NEXT3-06 existing selection card updates on regeneration, toggles same tile, preserves other tile labels',()=>{
  const previous=globalThis.document;
  const fake=domStub();globalThis.document=fake;
  try{
    let node={...full,x:1,y:1,amount:0,reserved:0,maxAmount:28,regrowthProgress:.1};
    const ui=Object.create(UI.prototype);
    ui.game={layer:SURFACE,currentLayer:testLayer(),world:{entrances:[]},
      colony:{getOrder:()=>null},foraging:{getNode:(x,y)=>x===1&&y===1?node:null},
      rooms:{getRoom:()=>null},lifecycle:{brood:[]}};
    ui.selection=null;
    ui.toggleMapSelection({layer:SURFACE,x:1,y:1});
    assert.equal(fake.getElementById('selection-card').classList.contains('hidden'),false);
    assert.match(fake.getElementById('selection-note').textContent,/10%/);
    node={...node,amount:7,reserved:2,regrowthProgress:.3};
    ui.refreshSelection();
    assert.match(fake.getElementById('selection-resource').textContent,/7\/28 · พร้อมเก็บ 5 · จอง 2/);
    ui.toggleMapSelection({layer:SURFACE,x:1,y:1});
    assert.equal(ui.selection,null,'same tile closes existing card');
    ui.toggleMapSelection({layer:SURFACE,x:0,y:0});
    assert.equal(fake.getElementById('selection-resource').classList.contains('hidden'),true);
    assert.equal(fake.getElementById('selection-terrain').textContent,'ทุ่งหญ้า');
  } finally {globalThis.document=previous;}
});

test('NEXT3-07 pointer regression: tap toggles; drag, pinch and military handler never select',()=>{
  const listeners={};
  const canvas={
    addEventListener(type,callback){listeners[type]=callback;},
    setPointerCapture(){},
    getBoundingClientRect(){return {left:0,top:0};}
  };
  const ui=Object.create(UI.prototype);
  let pans=0,zooms=0;
  ui.renderer={canvas,width:320,height:568};
  ui.game={layer:SURFACE,currentLayer:testLayer()};
  ui.cameras={[SURFACE]:{
    screenToCell(x,y){return {x:Math.floor(x/28),y:Math.floor(y/28)};},
    pan(){pans++;},
    zoomAt(){zooms++;}
  }};
  ui.tool='inspect';ui.selection=null;ui.updateRoomCost=()=>{};
  ui.refreshSelection=()=>{};ui.mapTapHandler=()=>false;
  ui.bindCanvas();
  const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0});
  const tap=(x,y)=>{listeners.pointerdown(event(1,x,y));listeners.pointerup(event(1,x,y));};
  tap(30,30);assert.equal(ui.selection.x,1);
  tap(30,30);assert.equal(ui.selection,null,'tap same tile dismisses');
  tap(30,30);assert.equal(ui.selection.x,1);
  listeners.pointerdown(event(1,30,30));
  listeners.pointermove(event(1,60,60));
  listeners.pointerup(event(1,60,60));
  assert.equal(ui.selection.x,1,'drag must not accidentally inspect');
  assert.ok(pans>0);
  listeners.pointerdown(event(1,30,30));
  listeners.pointerdown(event(2,70,70));
  listeners.pointermove(event(2,80,80));
  listeners.pointerup(event(2,80,80));
  listeners.pointerup(event(1,30,30));
  assert.equal(ui.selection.x,1,'pinch must not select');
  assert.ok(zooms>0);
  ui.mapTapHandler=()=>true;
  tap(65,65);
  assert.equal(ui.selection.x,1,'tactical handler keeps priority');
  ui.mapTapHandler=()=>false;
  listeners.pointerdown(event(1,30,30));
  listeners.pointercancel(event(1,30,30));
  assert.equal(ui.selection.x,1,'cancelled pointer does not select');
});
