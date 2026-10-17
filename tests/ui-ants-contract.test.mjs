import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterAnts,antDetails,ANT_PROFESSIONS,ANTS_PANEL_ID} from '../src/ui/renovation/ants.js';
function ant(i,profession='miner',x=1,y=2){
 return {id:'worker-'+i,profession,level:i%5+1,state:'idle',layer:'underground',x,y,alive:true,squadId:profession==='soldier'?'A':null,hp:profession==='soldier'?19:null,maxHP:profession==='soldier'?22:null,cargo:null,broodCargo:false};
}
const view={home:{selected:{layer:'underground',x:1,y:2}},
 ants:{queen:{id:'queen-1',caste:'queen',profession:'queen',level:1,layer:'underground',x:1,y:2,alive:true},
 workers:[ant(10,'soldier'),ant(2,'miner'),ant(3,'nurse',4,6)]}};
test('ant roster shows real worker professions, filters and numeric stable IDs',()=>{
 assert.equal(ANTS_PANEL_ID,'ui03-ants');
 assert.equal(Object.keys(ANT_PROFESSIONS).length,7);
 assert.deepEqual(filterAnts(view).map(a=>a.id),['worker-2','worker-3','worker-10']);
 assert.deepEqual(filterAnts(view,{role:'soldier'}).map(a=>a.id),['worker-10']);
 assert.deepEqual(filterAnts(view,{tileOnly:true}).map(a=>a.id),['worker-2','worker-10']);
 assert.deepEqual(filterAnts(view,{query:'WORKER-3'}).map(a=>a.id),['worker-3']);
 assert.deepEqual(filterAnts(view,{query:'พี่เลี้ยง'}).map(a=>a.id),['worker-3']);
});
test('zero, one, 150 ants, selected tile missing and queen distinct',()=>{
 assert.equal(filterAnts({ants:{workers:[]}}).length,0);
 assert.equal(filterAnts({ants:{workers:[ant(1)]}}).length,1);
 assert.equal(filterAnts({ants:{workers:Array.from({length:150},(_,i)=>ant(i+1))}}).length,150);
 assert.equal(filterAnts({ants:{workers:[ant(1)]}},{tileOnly:true}).length,0);
 assert.equal(filterAnts(view).some(x=>x.caste==='queen'),false);
});
test('ant details never invent civilian HP and preserve soldier source max HP',()=>{
 assert.equal(antDetails(ant(2,'miner')).some(([k])=>k==='พลังชีวิต'),false);
 assert.deepEqual(antDetails(ant(10,'soldier')).find(([k])=>k==='พลังชีวิต'),['พลังชีวิต','19/22']);
 const carrier={...ant(1),cargo:{type:'protein',amount:4},broodCargo:true};
 assert.ok(antDetails(carrier).some(([k])=>k==='สิ่งที่ขน'));
 assert.ok(antDetails(carrier).some(([k])=>k==='ตัวอ่อน'));
});
test('UI-03 uses shell overlay and facade rather than native selectors or global fixed CSS',()=>{
 const js=readFileSync(new URL('../src/ui/renovation/ants.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/ui/renovation/ants.css',import.meta.url),'utf8');
 assert.doesNotMatch(js,/alert\s*\(|confirm\s*\(|prompt\s*\(|showPicker\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(/);
 assert.doesNotMatch(js,/\bnew Game\b/);
 assert.doesNotMatch(css,/position\s*:\s*fixed/);
 assert.match(js,/actions\.focusAnt/);
 assert.match(js,/overlay\.registerPanel/);
 assert.match(css,/min-height:44px/);
});
