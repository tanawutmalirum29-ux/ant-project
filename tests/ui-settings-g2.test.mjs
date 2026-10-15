import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui/renovation/settings.js';
import {UIOverlayController} from '../src/ui/renovation/shell.js';

class FakeClassList{
  constructor(){this.values=new Set();}
  add(...x){for(const value of x)this.values.add(value);}
}
class Element{
  constructor(tag,doc){
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.dataset={};
    this.attributes={};this.children=[];this.classList=new FakeClassList();
    this.listeners=new Map();this.isConnected=true;this.hidden=false;this.disabled=false;
    this.value='';this.textContent='';this.parentElement=null;this.open=false;
  }
  append(...items){for(const child of items){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(k,fn){this.listeners.set(k,[...(this.listeners.get(k)||[]),fn]);}
  emit(name,more={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},...more};
    for(const fn of this.listeners.get(name)||[])fn(event);return event;}
  click(){if(!this.disabled)this.emit('click');}
  focus(){this.ownerDocument.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
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
function fixture(){
  const doc=new Document(),overlay=new UIOverlayController({document:doc});
  const parent=doc.createElement('div');parent.dataset.uiRegion='PRIMARY_SHEET';
  const host=doc.createElement('section');parent.append(host);
  let seed='ANT-001',token=0,requested=0,resets=0,cancels=0,pending=null;
  const subscribers=new Set();
  const snap=()=>({settings:{seed}});
  const notify=()=>{for(const fn of subscribers)fn(snap());};
  const actions={
    requestWorldReset(value){
      requested++;
      if(!value.trim()||[...value.trim()].length>40)return {ok:false,error:{code:'INVALID_SEED'}};
      pending={token:++token,seed:value.trim()};
      return {ok:true,requiresConfirmation:true,token:pending.token,seed:pending.seed};
    },
    cancelWorldReset(){cancels++;pending=null;return {ok:true};},
    confirmWorldReset(key){
      if(!pending||pending.token!==key)return {ok:false,error:{code:'RESET_NOT_CONFIRMED'}};
      const next=pending.seed;pending=null;seed=next;resets++;
      overlay.closeAll('world-reset');notify();
      return {ok:true,seed};
    }
  };
  const unsubscribe=mount(host,{view:snap(),actions,overlay,subscribe:fn=>{
    subscribers.add(fn);fn(snap());return ()=>subscribers.delete(fn);
  }});
  const ui={
    input:find(host,x=>x.className==='ui-settings-input'),
    form:find(host,x=>x.className==='ui-settings-form'),
    dialog:find(host,x=>x.className==='ui-settings-confirm'),
    accept:find(host,x=>x.className==='ui-settings-danger-button'),
    cancel:find(host,x=>x.textContent==='กลับไปแก้ไข'),
    warning:find(host,x=>x.className==='ui-settings-danger'),
    error:find(host,x=>x.className==='ui-settings-error')
  };
  return {host,overlay,actions,ui,unsubscribe,doc,get seed(){return seed;},
    get requested(){return requested;},get resets(){return resets;},
    get cancels(){return cancels;},get subscribers(){return subscribers.size;}};
}
test('UI-06 never resets on edit/submit and cancellation preserves current world',()=>{
  const x=fixture();x.overlay.openPanel('settings');
  x.ui.input.value='ปลวก-ทดสอบ';
  x.ui.input.emit('input');
  x.ui.form.emit('submit');
  assert.equal(x.resets,0);assert.equal(x.requested,1);
  assert.equal(x.overlay.isOpen('settings-confirm'),true);
  assert.equal(x.ui.dialog.open,true);
  assert.match(x.ui.warning.textContent,/ย้อนกลับไม่ได้/);
  x.ui.cancel.click();
  assert.equal(x.resets,0);assert.equal(x.seed,'ANT-001');
  assert.equal(x.ui.input.value,'ปลวก-ทดสอบ');
  assert.equal(x.overlay.isOpen('settings'),true);
  x.unsubscribe();x.overlay.dispose();assert.equal(x.subscribers,0);
});
test('UI-06 confirms once via token; second press cannot reset again',()=>{
  const x=fixture();x.overlay.openPanel('settings');
  x.ui.input.value='ANT-NEXT';x.ui.input.emit('input');
  x.ui.form.emit('submit');
  assert.equal(x.seed,'ANT-001');
  assert.equal(x.resets,0);
  x.ui.accept.click();
  assert.equal(x.seed,'ANT-NEXT');assert.equal(x.resets,1);
  assert.equal(x.overlay.isOpen('settings-confirm'),false);
  x.ui.accept.click();
  assert.equal(x.resets,1);
  x.unsubscribe();x.overlay.dispose();
});
test('UI-06 blocks empty, overlength and IME in-progress submission',()=>{
  const x=fixture();x.overlay.openPanel('settings');
  x.ui.input.value='    ';x.ui.form.emit('submit');assert.equal(x.requested,0);
  x.ui.input.value='a'.repeat(41);x.ui.form.emit('submit');assert.equal(x.requested,0);
  x.ui.input.value='กำลังพิมพ์';
  x.ui.input.emit('compositionstart');x.ui.form.emit('submit');assert.equal(x.requested,0);
  x.ui.input.emit('compositionend');x.ui.form.emit('submit');assert.equal(x.requested,1);
  assert.equal(x.ui.input.maxLength,40);
  x.overlay.closeTop('escape');assert.equal(x.resets,0);
  x.unsubscribe();x.overlay.dispose();
});
test('UI-06 cleanup unregisters panels and subscription',()=>{
  const x=fixture();
  assert.equal(x.overlay.registry.has('settings'),true);
  assert.equal(x.overlay.registry.has('settings-confirm'),true);
  x.unsubscribe();
  assert.equal(x.overlay.registry.has('settings'),false);
  assert.equal(x.overlay.registry.has('settings-confirm'),false);
  assert.equal(x.subscribers,0);
  x.overlay.dispose();
});
test('UI-06 CSS preserves usable native input, buttons and viewport-safe dialog',()=>{
  const css=readFileSync(new URL('../src/ui/renovation/settings.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../src/ui/renovation/settings.js',import.meta.url),'utf8');
  assert.match(css,/user-select:text!important/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/max-height:calc\(100dvh - 24px\)/);
  assert.match(js,/requestWorldReset\(raw\)/);
  assert.match(js,/confirmWorldReset\(pendingToken\)/);
  assert.doesNotMatch(js,/\bwindow\.(alert|confirm|prompt)\s*\(/);
});
