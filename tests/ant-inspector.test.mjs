import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game.js';
import { Camera } from '../src/render/camera.js';
import {
  antAtPointer,antById,antsAtTile,antRole,antState,renderAntInspector
} from '../src/ui/ant-inspector.js';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Ant inspector hit-tests displayed ant sprites and ignores other map layers',()=>{
  const game=new Game('ANT-INSPECT-01');
  const q=game.colony.queen,w=game.colony.workers[0];
  const cam=new Camera(game.layer,q);
  const wpx=cam.worldToScreen((w.x+.5)*28,(w.y+.5)*28,768,1024);
  assert.equal(antAtPointer(game,cam,wpx,768,1024)?.id,w.id);
  assert.equal(antAtPointer(game,cam,{x:-100,y:-100},768,1024),null);
  assert.equal(antById(game,q.id),q);
  assert.equal(antById(game,'does-not-exist'),null);
  assert.equal(antsAtTile(game,game.layer,w.x,w.y).some(a=>a.id===w.id),true);
  assert.match(antRole(w),/มด/);
  assert.equal(antState(q),'ประจำรัง');
  game.layer='surface';
  assert.equal(antAtPointer(game,cam,wpx,768,1024),null);
});

test('Ant inspector uses only semantic HTML and scoped CSS, not browser alert/prompt/confirm',()=>{
  const html=src('index.html');
  const app=src('src/ui/app.js');
  const skin=src('src/ui/visual/inspector.css');
  const inspector=src('src/ui/ant-inspector.js');
  const combat=src('src/ui/combat-controls.js');
  assert.match(html,/src\/ui\/visual\/inspector\.css/);
  assert.ok(html.indexOf('v3-compact.css')<html.indexOf('inspector.css'));
  for(const id of ['selection-ants','selection-ants-list','selection-ant-detail','selection-ants-count']){
    assert.equal([...html.matchAll(/\bid="([^"]+)"/g)].filter(m=>m[1]===id).length,1,id);
  }
  assert.match(app,/antAtPointer\(this\.game,this\.camera,p/);
  assert.match(app,/renderAntInspector\(this\.game,s,this\.selectedAntId\)/);
  assert.match(combat,/this\.ui\.select\(\{layer:ant\.layer,x:ant\.x,y:ant\.y\},ant\.id\)/);
  assert.match(skin,/#selection-card \.selection-ant-button\[aria-pressed="true"\]/);
  assert.match(skin,/@media\(max-width:680px\)/);
  for(const code of [app,inspector]){
    assert.doesNotMatch(code,/\b(?:window\.)?(?:alert|prompt|confirm)\s*\(/);
  }
});

test('Ant inspector renders selectable same-tile occupants without duplicating data and updates health',()=>{
  function node(tag){
    const classes=new Set();
    const el={
      tag,className:'',textContent:'',dataset:{},children:[],attributes:{},
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,force)=>{if(force)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},
      append(...items){this.children.push(...items);},
      replaceChildren(...items){this.children=items.flatMap(item=>item.tag==='fragment'?item.children:[item]);},
      setAttribute(k,v){this.attributes[k]=v;},
      querySelectorAll(q){return q==='button[data-ant-id]'?this.children.filter(c=>c.tag==='button'):[];},
      querySelector(q){return q==='.selection-ant-role'?this.children.find(c=>c.className==='selection-ant-role'):null;}
    };
    return el;
  }
  const ids=new Map(['selection-ants','selection-ants-list','selection-ant-detail','selection-ants-count'].map(id=>[id,node(id)]));
  const old=globalThis.document;
  globalThis.document={
    getElementById:id=>ids.get(id),
    createElement:node,
    createDocumentFragment:()=>node('fragment')
  };
  try{
    const game=new Game('ANT-INSPECT-02');
    const soldier=game.colony.workers[0],second=game.colony.workers[1];
    second.x=soldier.x;second.y=soldier.y;
    soldier.combatRole='soldier';soldier.combatHP=9;soldier.squadId='B';
    const tile={layer:soldier.layer,x:soldier.x,y:soldier.y};
    renderAntInspector(game,tile,soldier.id);
    const list=ids.get('selection-ants-list'),detail=ids.get('selection-ant-detail');
    assert.equal(list.children.length,2);
    assert.equal(list.children[0].attributes['aria-pressed'],'true');
    assert.match(detail.children[1].textContent,/HP 9\/16/);
    const same=list.children[0];
    soldier.combatHP=6;
    renderAntInspector(game,tile,soldier.id);
    assert.equal(list.children[0],same,'unchanged roster must not destroy focused controls on refresh');
    assert.match(detail.children[1].textContent,/HP 6\/16/);
    renderAntInspector(game,tile,second.id);
    assert.equal(list.children[1].attributes['aria-pressed'],'true');
    renderAntInspector(game,null,null);
    assert.equal(list.children.length,0);
    assert.equal(ids.get('selection-ants').classList.contains('hidden'),true);
  }finally{globalThis.document=old;}
});
