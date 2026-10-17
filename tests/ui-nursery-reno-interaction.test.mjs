import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from '../src/ui/renovation/nursery.js';

class El {
 constructor(doc,tag='div') {this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this._text='';this.style={};this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.disabled=false;this.className='';this.classList={toggle(){}};}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('')}
 set textContent(v){this._text=String(v);this.children=[]}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n)}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 setAttribute(k,v){this.attributes[k]=String(v)}
 getAttribute(k){return this.attributes[k]??null}
 removeAttribute(k){delete this.attributes[k]}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 click(){if(!this.disabled)for(const f of this.listeners.click??[])f({target:this,preventDefault(){}})}
 focus(){this.ownerDocument.activeElement=this}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this)}
 contains(n){return this===n||this.children.some(x=>x.contains(n))}
 closest(selector){let x=this;while(x){if(selector==='#ui-renovation-root'&&x.id==='ui-renovation-root')return x;x=x.parentNode}return null}
 querySelector(sel){return this.querySelectorAll(sel)[0]??null}
 querySelectorAll(sel){
  const ok=x=>sel==='[data-empty]'?x.dataset.empty!==undefined:sel==='button'?x.tagName==='BUTTON':sel==='button:not(:disabled)'?x.tagName==='BUTTON'&&!x.disabled:sel==='button[aria-selected="true"]'?x.tagName==='BUTTON'&&x.getAttribute('aria-selected')==='true':false;
  const list=[],walk=x=>{for(const y of x.children){if(ok(y))list.push(y);walk(y)}};walk(this);return list
 }
}
class Overlay {
 constructor(){this.panels=new Map();this.open=[]}
 registerPanel(id,info){this.panels.set(id,info);return()=>{this.closePanel(id,'unmount');this.panels.delete(id)}}
 isOpen(id){return this.open.includes(id)}
 openPanel(id){
  const p=this.panels.get(id);if(!p)return {ok:false};
  if(this.isOpen(id))return {ok:true};
  if(['sheet','modal'].includes(p.kind))for(const x of [...this.open])this.closePanel(x,'replaced');
  p.show?.();this.open.push(id);return {ok:true}
 }
 closePanel(id,reason='dismiss'){
  if(!this.isOpen(id))return false;
  this.open=this.open.filter(x=>x!==id);this.panels.get(id)?.hide?.(reason);return true
 }
}
function fixture(){
 const doc={activeElement:null,createElement(t){return new El(this,t)}};
 const root=doc.createElement('div');root.id='ui-renovation-root';
 const container=doc.createElement('section');root.append(container);
 const overlay=new Overlay();let notify=()=>{};
 return {root,container,overlay,doc,subscribe:f=>{notify=f;return()=>{notify=()=>{}}},push:v=>notify(v)}
}
function find(root,className) {
 if(root.className.split(' ').includes(className))return root;
 for(const child of root.children){const x=find(child,className);if(x)return x}
 return null
}

const room=id=>({id,type:'nursery',status:'ready',connected:true,width:2,height:2,slots:4,used:0,free:4,orders:[]});
const snap=id=>({home:{layer:'underground'},ants:{queen:{alive:true}},nursery:{selectedRoomId:id,rooms:['R1','R2','R3'].map(room),totalPopulation:8,maxPopulation:150}});
test('initial dormant mount and overlay replacement never reopen after 4 HUD ticks',()=>{
 const f=fixture();f.root.hidden=true;
 const actions={nurseryCost:()=>({carbs:1,protein:1}),queueEgg:()=>({ok:true}),cancelEgg:()=>({ok:true})};
 const end=mount(f.container,{view:snap('R1'),actions,overlay:f.overlay,subscribe:f.subscribe});
 assert.equal(f.overlay.isOpen('ui04-nursery'),false);
 f.root.hidden=false;for(let i=0;i<4;i++)f.push(snap('R1'));
 assert.equal(f.overlay.isOpen('ui04-nursery'),false);
 f.push(snap('R2'));assert.equal(f.overlay.isOpen('ui04-nursery'),true);
 f.overlay.registerPanel('settings',{element:f.doc.createElement('section'),kind:'sheet'});
 f.overlay.openPanel('settings');
 for(let i=0;i<4;i++)f.push(snap('R2'));
 assert.equal(f.overlay.isOpen('settings'),true);
 assert.equal(f.overlay.isOpen('ui04-nursery'),false);
 f.overlay.closePanel('settings');
 const reopen=find(f.container,'ui04-reopen');assert.equal(reopen.hidden,false);
 reopen.click();assert.equal(f.overlay.isOpen('ui04-nursery'),true);
 find(f.container,'ui04-close').click();
 for(let i=0;i<4;i++)f.push(snap('R2'));
 assert.equal(f.overlay.isOpen('ui04-nursery'),false);
 f.push(snap('R3'));assert.equal(f.overlay.isOpen('ui04-nursery'),true);
 end();
});
