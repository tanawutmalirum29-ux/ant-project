import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui/renovation/home.js';
import {UIOverlayController} from '../src/ui/renovation/shell.js';

class FakeClassList{
  constructor(){this.flags=new Set();}
  add(v){this.flags.add(v);}
  toggle(v,on){if(on)this.flags.add(v);else this.flags.delete(v);}
  contains(v){return this.flags.has(v);}
}
class Element{
  constructor(tag,doc){
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;
    this.dataset={};this.attributes={};this.children=[];
    this.classList=new FakeClassList();this.listeners=new Map();
    this.textContent='';this.hidden=false;this.disabled=false;this.isConnected=true;
    this.parentElement=null;
  }
  append(...parts){for(const child of parts){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...parts){this.children=[];this.append(...parts);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  removeAttribute(k){delete this.attributes[k];}
  getAttribute(k){return this.attributes[k]??null;}
  addEventListener(k,fn){const list=this.listeners.get(k)||[];list.push(fn);this.listeners.set(k,list);}
  click(){if(this.disabled)return;for(const fn of this.listeners.get('click')||[])fn({target:this});}
  focus(){this.ownerDocument.activeElement=this;}
}
class Document{
  constructor(){this.activeElement=null;this.listeners=new Map();}
  createElement(tag){return new Element(tag,this);}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  removeEventListener(k){this.listeners.delete(k);}
}
const find=(root,predicate)=>{
  if(predicate(root))return root;
  for(const child of root.children){const found=find(child,predicate);if(found)return found;}
  return null;
};
const all=(root,predicate)=>[...(predicate(root)?[root]:[]),...root.children.flatMap(x=>all(x,predicate))];
const slot=(doc,id)=>{
  const parent=doc.createElement('div');parent.dataset.uiRegion=id;
  const child=doc.createElement('section');parent.append(child);return child;
};
const initial=()=>({home:{layer:'underground',tool:'inspect',speed:1,seed:'ANT-001',
  timeTicks:25,population:5,maxPopulation:150,resources:{carbs:10,protein:20,water:30},
  selected:null,targeting:false},settings:{seed:'ANT-001'}});
function setup(){
  const doc=new Document(),overlay=new UIOverlayController({document:doc});
  let state=initial(),listeners=new Set(),switches=0,toolCalls=0;
  const notify=()=>{for(const fn of listeners)fn(state);};
  const actions={
    toggleLayer(){switches++;state={...state,home:{...state.home,
      layer:state.home.layer==='underground'?'surface':'underground',
      tool:state.home.layer==='underground'?'inspect':state.home.tool}};
      notify();return {ok:true};},
    setTool(mode){toolCalls++;
      if(state.home.layer==='surface'&&mode!=='inspect')
        return {ok:false,error:{code:'UNDERGROUND_ONLY'}};
      state={...state,home:{...state.home,tool:mode}};notify();return {ok:true};},
    setSpeed(speed){state={...state,home:{...state.home,speed}};notify();return {ok:true};},
    zoom(){return {ok:true};},recenter(){return {ok:true};}
  };
  return {doc,overlay,actions,subscribe(fn){listeners.add(fn);fn(state);
    return ()=>listeners.delete(fn);},get state(){return state;},get switches(){return switches;},
    get toolCalls(){return toolCalls;},get subscribers(){return listeners.size;}};
}
test('UI-01 command rail has exactly five controls and one current-layer toggle for 20 clicks',()=>{
  const s=setup(),host=slot(s.doc,'PRIMARY_COMMAND');
  const dispose=mount(host,{...s,view:s.state,subscribe:s.subscribe});
  const buttons=all(host,x=>x.tagName==='BUTTON');
  assert.equal(buttons.length,5);
  assert.deepEqual(buttons.map(x=>x.dataset.homeAction),['inspect','dig','room','layer','menu']);
  const layer=buttons[3];
  assert.match(layer.getAttribute('aria-label'),/ใต้ดิน.*พื้นผิว/);
  for(let i=0;i<20;i++){
    layer.click();
    assert.match(layer.getAttribute('aria-label'),i%2===0?/พื้นผิว.*ใต้ดิน/:/ใต้ดิน.*พื้นผิว/);
  }
  assert.equal(s.switches,20);assert.equal(s.state.home.layer,'underground');
  assert.equal(layer.getAttribute('aria-pressed'),'false');
  layer.click();
  assert.equal(s.state.home.tool,'inspect');
  assert.equal(buttons[1].disabled,true);
  assert.equal(buttons[2].disabled,true);
  buttons[1].click();assert.equal(s.state.home.tool,'inspect');
  layer.click();
  assert.equal(buttons[1].disabled,false);
  buttons[1].click();assert.equal(s.state.home.tool,'dig');
  assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
  dispose();assert.equal(s.subscribers,0);
  s.overlay.dispose();
});
test('UI-01 HUD reflects authoritative resources, seed, ticks and speed without remount',()=>{
  const s=setup(),host=slot(s.doc,'HUD_TOP');
  const dispose=mount(host,{...s,view:s.state,subscribe:s.subscribe});
  assert.equal(all(host,x=>x.className==='ui-home-stat').length,3);
  const speed=find(host,x=>x.className==='ui-home-speed');
  assert.equal(speed.textContent,'×1');
  speed.click();
  assert.equal(speed.textContent,'Ⅱ');
  speed.click();
  assert.equal(speed.textContent,'×1');
  assert.equal(all(host,x=>x.className==='ui-home-seed')[0].textContent,'Seed: ANT-001');
  dispose();assert.equal(s.subscribers,0);s.overlay.dispose();
});
test('UI-01 menu uses shared overlay and opens registered Settings panel',()=>{
  const s=setup(),commands=slot(s.doc,'PRIMARY_COMMAND'),menu=slot(s.doc,'PRIMARY_SHEET');
  const offMenu=mount(menu,{...s,view:s.state,subscribe:s.subscribe});
  const offTools=mount(commands,{...s,view:s.state,subscribe:s.subscribe});
  const opener=find(commands,x=>x.dataset.homeAction==='menu');
  opener.click();assert.equal(s.overlay.isOpen('home-menu'),true);
  assert.equal(opener.getAttribute('aria-expanded'),'true');
  const settingElement=s.doc.createElement('div');
  settingElement.hidden=true;
  const offSettings=s.overlay.registerPanel('settings',{element:settingElement,kind:'sheet'});
  const button=find(menu,x=>x.textContent==='ตั้งค่าและ Seed');
  button.click();
  assert.equal(s.overlay.isOpen('home-menu'),false);
  assert.equal(s.overlay.isOpen('settings'),true);
  assert.equal(opener.getAttribute('aria-expanded'),'false');
  s.overlay.closePanel('settings');offSettings();
  offTools();offMenu();s.overlay.dispose();
  assert.equal(s.subscribers,0);
});
test('UI-01 CSS preserves at least 44px commands, height-first rail and one toolbar',()=>{
  const css=readFileSync(new URL('../src/ui/renovation/home.css',import.meta.url),'utf8');
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/min-width:44px;min-height:44px/);
  assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.doesNotMatch(css,/\.layer-switch|\.bottom-bar|z-index:\s*9999/);
});

test('retapping active Room/Dig toggles to Inspect with authoritative snapshot, without a second game handler',()=>{
  const s=setup(),host=slot(s.doc,'PRIMARY_COMMAND');
  const dispose=mount(host,{...s,view:s.state,subscribe:s.subscribe});
  const buttons=all(host,x=>x.tagName==='BUTTON');
  const inspect=buttons[0],dig=buttons[1],room=buttons[2];
  room.click();assert.equal(s.state.home.tool,'room');
  assert.equal(room.getAttribute('aria-pressed'),'true');
  room.click();assert.equal(s.state.home.tool,'inspect');
  assert.equal(inspect.getAttribute('aria-pressed'),'true');
  dig.click();assert.equal(s.state.home.tool,'dig');
  dig.click();assert.equal(s.state.home.tool,'inspect');
  dig.click();room.click();assert.equal(s.state.home.tool,'room');
  inspect.click();assert.equal(s.state.home.tool,'inspect');
  inspect.click();assert.equal(s.state.home.tool,'inspect');
  assert.equal(s.toolCalls,8,'one facade action per real toolbar click');
  dispose();s.overlay.dispose();
});
