import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui/renovation/research.js';
import {UIOverlayController} from '../src/ui/renovation/shell.js';

class ClassList {
  constructor(){this.values=new Set();}
  add(...values){for(const value of values)this.values.add(value);}
  contains(value){return this.values.has(value);}
}
class Element {
  constructor(tag,doc){
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;
    this.className='';this.classList=new ClassList();this.attributes={};
    this.children=[];this.parentElement=null;this.dataset={};this.style={};
    this.hidden=false;this.disabled=false;this.isConnected=true;
    this.textContent='';this.listeners=new Map();this.scrollTop=0;
  }
  append(...nodes){for(const node of nodes)this.insertBefore(node,null);}
  insertBefore(node,reference){
    if(node.parentElement){
      const items=node.parentElement.children;
      const position=items.indexOf(node);
      if(position>=0)items.splice(position,1);
    }
    const i=reference?this.children.indexOf(reference):-1;
    this.children.splice(i>=0?i:this.children.length,0,node);
    node.parentElement=this;node.isConnected=true;return node;
  }
  replaceChildren(...nodes){
    for(const node of this.children){node.parentElement=null;node.isConnected=false;}
    this.children=[];this.append(...nodes);
  }
  remove(){
    if(this.parentElement){
      this.parentElement.children=this.parentElement.children.filter(node=>node!==this);
      this.parentElement=null;
    }
    this.isConnected=false;
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];}
  addEventListener(name,listener){
    const listeners=this.listeners.get(name)||[];
    listeners.push(listener);this.listeners.set(name,listeners);
  }
  focus(){this.ownerDocument.activeElement=this;}
  click(){
    if(this.disabled||this.hidden)return;
    for(const fn of this.listeners.get('click')||[])fn({target:this});
  }
  querySelector(selector){
    if(selector.includes('button:not([disabled])'))
      return walk(this).find(item=>item!==this&&item.tagName==='BUTTON'&&!item.disabled&&!item.hidden)??null;
    return null;
  }
}
class Document {
  constructor(){this.activeElement=null;this.listeners=new Map();}
  createElement(tag){return new Element(tag,this);}
  addEventListener(type,fn){
    const set=this.listeners.get(type)||new Set();
    set.add(fn);this.listeners.set(type,set);
  }
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  pressEscape(){
    const event={key:'Escape',defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},
      stopPropagation(){}};
    for(const fn of this.listeners.get('keydown')||[])fn(event);
  }
}
function walk(node){return [node,...node.children.flatMap(walk)];}
function byClass(node,name){return walk(node).find(n=>n.className?.split(' ').includes(name));}
function allClass(node,name){return walk(node).filter(n=>n.className?.split(' ').includes(name));}
function byTech(node,id){
  return allClass(node,'ui-research-card').find(n=>n.dataset.techId===id);
}
const IDS=['foraging_routes','excavation_tools','construction_techniques',
  'nursery_care','warehouse_extension','soldier_armor'];
const getCost=()=>({carbs:6,protein:4,water:3});
function makeTech(id,i){
  return {id,title:'เทคโนโลยีที่ '+(i+1),description:'รายละเอียดที่ชัดเจน',effectLabel:'เพิ่มประสิทธิภาพ',
    status:i<2?'available':'locked',
    prerequisiteIds:i<2?[]:[IDS[i-1]],
    missingPrerequisiteIds:i<2?[]:[IDS[i-1]],
    cost:getCost(),missingResources:{carbs:0,protein:0,water:0},
    totalTicks:600+i*100,remainingTicks:600+i*100,canStart:i<2,canCancel:false};
}
function setup(){
  const doc=new Document(),parent=doc.createElement('div');
  parent.dataset.uiRegion='PRIMARY_SHEET';
  const host=doc.createElement('div');parent.append(host);
  const overlay=new UIOverlayController({document:doc});
  const menuOpener=doc.createElement('button');
  let starts=0,cancels=0;
  let snapshot={home:{seed:'A',timeTicks:2},research:{
    technologies:IDS.map(makeTech),activeResearchId:null,inventory:getCost(),
    refundPreview:null,cancelPolicyLabel:'คืน 100% ไปยังคลังต้นทาง',ticksPerGameSecond:10}};
  const subscribers=new Set();
  const notify=()=>{for(const fn of [...subscribers])fn(snapshot);};
  function activeTech(id){
    snapshot={...snapshot,research:{...snapshot.research,
      activeResearchId:id,refundPreview:getCost(),
      technologies:snapshot.research.technologies.map(t=>({...t,
        status:t.id===id?'active':t.status,
        canStart:false,canCancel:t.id===id}))}};
    notify();
  }
  const actions={
    startResearch(id){
      starts++;
      if(snapshot.research.activeResearchId||!snapshot.research.technologies.find(t=>t.id===id)?.canStart)
        return {ok:false,error:{code:'RESEARCH_ACTIVE'}};
      activeTech(id);return {ok:true};
    },
    cancelResearch(){
      cancels++;
      if(!snapshot.research.activeResearchId)return {ok:false,error:{code:'NO_ACTIVE_RESEARCH'}};
      const id=snapshot.research.activeResearchId;
      snapshot={...snapshot,research:{...snapshot.research,
        activeResearchId:null,refundPreview:null,
        technologies:snapshot.research.technologies.map(t=>({...t,
          status:t.id===id?'available':t.status,
          canStart:t.id===id,canCancel:false}))}};
      notify();
      return {ok:true};
    }
  };
  const dispose=mount(host,{view:snapshot,actions,overlay,
    subscribe(fn){subscribers.add(fn);fn(snapshot);return()=>subscribers.delete(fn);}});
  return {doc,host,overlay,actions,dispose,menuOpener,
    get starts(){return starts;},get cancels(){return cancels;},
    get snapshot(){return snapshot;},get subscriberCount(){return subscribers.size;},
    emit(value){snapshot=value;notify();},activeTech};
}

test('Research sheet creates exactly six key-stable cards and uses one existing overlay',()=>{
  const s=setup();
  assert.equal(s.host.children.length,1);
  const sheet=byClass(s.host,'ui-research-sheet');
  assert.equal(sheet.hidden,true);
  assert.equal(allClass(s.host,'ui-research-card').length,6);
  assert.deepEqual(allClass(s.host,'ui-research-card').map(n=>n.dataset.techId),IDS);
  assert.equal(allClass(s.host,'ui-research-confirm').length,7);
  assert.equal(byClass(s.host,'ui-research-progress').hidden,true);
  assert.equal(sheet.getAttribute('role'),'region');
  assert.equal(s.overlay.openPanel('research',{opener:s.menuOpener}).ok,true);
  assert.equal(s.overlay.isOpen('research'),true);
  assert.equal(sheet.hidden,false);
  const currentCards=allClass(s.host,'ui-research-card');
  const next={...s.snapshot,home:{...s.snapshot.home,timeTicks:3}};
  s.emit(next);
  assert.deepEqual(allClass(s.host,'ui-research-card'),currentCards,'preserves DOM node identity per fixed tick');
  assert.equal(byTech(s.host,IDS[0]).children[0].getAttribute('aria-expanded'),'false');
  s.dispose();assert.equal(s.subscriberCount,0);
  assert.equal(s.overlay.isOpen('research'),false);
  s.overlay.dispose();
});

test('spending and cancellation are both inline two-stage commands, never automatic',()=>{
  const s=setup();
  s.overlay.openPanel('research',{opener:s.menuOpener});
  const first=byTech(s.host,IDS[0]);
  const trigger=byClass(first,'ui-research-trigger');
  trigger.click();
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  byClass(first,'ui-research-start').click();
  assert.equal(s.starts,0,'opening confirmation must not spend');
  assert.equal(byClass(first,'ui-research-confirm').hidden,false);
  byClass(first,'ui-research-primary').click();
  assert.equal(s.starts,1);
  byClass(first,'ui-research-primary').click();
  assert.equal(s.starts,1,'second confirmation click must not start again');
  assert.equal(s.snapshot.research.activeResearchId,IDS[0]);
  const cancel=byClass(s.host,'ui-research-cancel');
  assert.equal(cancel.disabled,false);
  cancel.click();
  assert.equal(s.cancels,0,'opening cancel confirmation must not refund');
  assert.equal(byClass(s.host,'ui-research-disclosure').textContent.includes('คืน 100%'),true);
  byClass(s.host,'ui-research-danger').click();
  assert.equal(s.cancels,1);
  assert.equal(s.snapshot.research.activeResearchId,null);
  byClass(s.host,'ui-research-danger').click();
  assert.equal(s.cancels,1,'second cancel is inert');
  s.dispose();s.overlay.dispose();
});

test('locked and unaffordable technologies cannot invoke gameplay actions',()=>{
  const s=setup();
  s.overlay.openPanel('research',{opener:s.menuOpener});
  const locked=byTech(s.host,IDS[3]);
  byClass(locked,'ui-research-trigger').click();
  assert.equal(byClass(locked,'ui-research-start').disabled,true);
  byClass(locked,'ui-research-start').click();
  assert.equal(s.starts,0);
  const updated={...s.snapshot,research:{...s.snapshot.research,
    technologies:s.snapshot.research.technologies.map((t,i)=>
      i===0?{...t,canStart:false,missingResources:{carbs:2,protein:0,water:1}}:t)}};
  s.emit(updated);
  const first=byTech(s.host,IDS[0]);
  byClass(first,'ui-research-trigger').click();
  assert.equal(byClass(first,'ui-research-start').disabled,true);
  assert.match(byClass(first,'ui-research-missing').textContent,/อาหาร/);
  assert.equal(s.starts,0);
  s.dispose();s.overlay.dispose();
});

test('progress uses authoritative remainingTicks; reset clears local confirmation',()=>{
  const s=setup();
  s.overlay.openPanel('research',{opener:s.menuOpener});
  s.activeTech(IDS[0]);
  const progress=byClass(s.host,'ui-research-progress');
  assert.equal(progress.hidden,false);
  assert.equal(progress.value,0);
  const snapshot={...s.snapshot,home:{...s.snapshot.home,timeTicks:53},
    research:{...s.snapshot.research,technologies:s.snapshot.research.technologies.map(
      t=>t.id===IDS[0]?{...t,remainingTicks:550}:t)}};
  s.emit(snapshot);
  assert.equal(progress.value,50);
  assert.match(byClass(s.host,'ui-research-remaining').textContent,/550/);
  byClass(s.host,'ui-research-cancel').click();
  assert.equal(byClass(s.host,'ui-research-confirm').hidden,false);
  const fresh={...snapshot,home:{seed:'A',timeTicks:0},research:{
    ...snapshot.research,activeResearchId:null,refundPreview:null,
    technologies:IDS.map(makeTech)}};
  s.emit(fresh);
  assert.equal(byClass(s.host,'ui-research-confirm').hidden,true);
  assert.equal(byClass(s.host,'ui-research-trigger').getAttribute('aria-expanded'),'false');
  assert.equal(s.cancels,0);
  s.dispose();s.overlay.dispose();
});

test('Escape/outside close only sheet, restore opener, and never mutate Research',()=>{
  const s=setup();
  s.overlay.openPanel('research',{opener:s.menuOpener});
  s.activeTech(IDS[0]);
  s.doc.pressEscape();
  assert.equal(s.overlay.isOpen('research'),false);
  assert.equal(s.doc.activeElement,s.menuOpener);
  assert.equal(s.cancels,0);
  s.overlay.openPanel('research',{opener:s.menuOpener});
  s.overlay.closeTop('outside');
  assert.equal(s.cancels,0);
  assert.equal(s.overlay.isOpen('research'),false);
  s.dispose();s.overlay.dispose();
});

test('CSS has one scrollable sheet, six-size media constraints and 44px targets',()=>{
  const css=readFileSync(new URL('../src/ui/renovation/research.css',import.meta.url),'utf8');
  assert.match(css,/min-height:44px;min-width:44px/);
  assert.match(css,/overflow-x:hidden;overflow-y:auto/);
  assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(css,/@media\(min-width:1200px\) and \(min-height:501px\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.doesNotMatch(css,/\.ui-research-detail\s*\{[^}]*overflow-y:auto/);
  const js=readFileSync(new URL('../src/ui/renovation/research.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/\bwindow\.(alert|confirm|prompt)\s*\(|\bsetInterval\s*\(/);
});
