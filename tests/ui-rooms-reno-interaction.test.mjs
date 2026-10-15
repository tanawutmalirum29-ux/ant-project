import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from '../src/ui/renovation/rooms.js';
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


const area={from:{x:4,y:5},to:{x:5,y:6}};
const snap=(tool='dig')=>({home:{tool,layer:'underground',selected:{layer:'underground',x:4,y:5}},rooms:{items:[],catalog:[{type:'nursery',name:'Nursery',width:2,height:2},{type:'food_store',name:'Food',width:2,height:2}],limits:{minArea:4,maxWidth:8,maxHeight:8},canvas:{digSelection:null,digPreview:null,roomPreview:null,roomType:'nursery'}}});
test('clear uses G3 authoritative digSelection; stays clear through 4 HUD updates',()=>{
 const f=fixture();let current=snap();current.rooms.canvas.digSelection=structuredClone(area);
 let clears=0,apply=0;
 const actions={
  roomPlan:()=>({cost:{carbs:3,protein:2},ticks:20}),validateRoom:()=>({ok:true}),queueRoom:()=>({ok:true}),cancelRoom:()=>({ok:true}),
  selectRoomType:type=>({ok:true,type}),inspectDig:()=>({existing:1,available:2,blocked:0}),
  clearDigSelection:()=>{clears++;current=structuredClone(current);current.rooms.canvas.digSelection=null;f.push(current);return{ok:true}},
  applySelectedDig:()=>{apply++;current=structuredClone(current);current.rooms.canvas.digSelection=null;f.push(current);return{ok:true,data:{cancelled:1}}}
 };
 const end=mount(f.container,{view:current,actions,overlay:f.overlay,subscribe:f.subscribe});
 const clear=find(f.container,'ui05-secondary');
 assert.equal(clear.disabled,false);
 clear.click();assert.equal(clears,1);assert.equal(apply,0);
 for(let i=0;i<4;i++)f.push(current);
 assert.equal(clear.disabled,true);
 assert.match(find(f.container,'ui05-dig-summary').textContent,/ยังไม่ได้ลากเลือก/);
 current=structuredClone(current);current.rooms.canvas.digSelection=structuredClone(area);f.push(current);
 assert.equal(clear.disabled,false);
 find(f.container,'ui05-actions').children[1].click();
 assert.equal(apply,1,'applySelectedDig called exactly once');
 assert.equal(clear.disabled,true);
 end();
});
test('G3 picker keeps local type in sync with actual map selector snapshots',()=>{
 const f=fixture();let current=snap('room');let called=[];
 const actions={
  roomPlan:()=>({cost:{carbs:3,protein:2},ticks:20}),validateRoom:()=>({ok:true}),queueRoom:()=>({ok:true}),cancelRoom:()=>({ok:true}),
  inspectDig:()=>({existing:0,available:0,blocked:0}),applySelectedDig:()=>({ok:true}),clearDigSelection:()=>({ok:true}),
  selectRoomType:type=>{called.push(type);current=structuredClone(current);current.rooms.canvas.roomType=type;f.push(current);return {ok:true,type}}
 };
 const end=mount(f.container,{view:current,actions,overlay:f.overlay,subscribe:f.subscribe});
 find(f.container,'ui05-type-list').children[1].click();
 assert.deepEqual(called,['food_store']);
 assert.match(find(f.container,'ui05-type-trigger').textContent,/Food/);
 current=structuredClone(current);current.rooms.canvas.roomType='nursery';f.push(current);
 assert.match(find(f.container,'ui05-type-trigger').textContent,/Nursery/);
 end();
});
