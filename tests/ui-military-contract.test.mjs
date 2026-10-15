import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {militaryRoster,selectedSquad,militaryError,MILITARY_PANEL_ID} from '../src/ui/renovation/military.js';
const snapshot={ants:{workers:[
 {id:'worker-10',profession:'soldier',level:3,squadId:'A',hp:19,maxHP:22},
 {id:'worker-2',profession:'soldier',level:5,squadId:'B',hp:27,maxHP:28},
 {id:'worker-3',profession:'miner',level:2}
]},military:{squads:[
 {id:'A',count:1,soldiers:[{id:'worker-10',hp:19,maxHP:22,arrived:true}]},
 {id:'B',count:1,soldiers:[{id:'worker-2',hp:27,maxHP:28}]}
]}};
test('military G1 read-only projection preserves levels and actual HP',()=>{
 assert.equal(MILITARY_PANEL_ID,'ui02-military');
 assert.equal(selectedSquad(snapshot,'A').count,1);
 assert.deepEqual(militaryRoster(snapshot,'A').map(a=>a.id),['worker-10']);
 assert.equal(militaryRoster(snapshot,'A')[0].maxHP,22);
 assert.equal(militaryRoster(snapshot,'B')[0].maxHP,28);
 assert.deepEqual(militaryRoster(snapshot,'A','all').map(a=>a.id),['worker-2','worker-10']);
});
test('military zero/partial snapshots and error mapping',()=>{
 assert.deepEqual(militaryRoster({ants:{workers:[]},military:{squads:[]}}),[]);
 assert.equal(selectedSquad({},'A'),null);
 assert.equal(militaryRoster({ants:{workers:[{id:'X',profession:'soldier'}]}},'A','all')[0].hp,null);
 assert.match(militaryError({ok:false,error:{code:'UNREACHABLE_RALLY'}}),/ไปถึง/);
 assert.equal(militaryError({ok:true}),'');
});
test('military CSS and actions stay confined to G1 facade',()=>{
 const js=readFileSync(new URL('../src/ui/renovation/military.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/ui/renovation/military.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/position\s*:\s*fixed/);
 assert.doesNotMatch(js,/alert\s*\(|confirm\s*\(|prompt\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(/);
 for(const action of ['startRally','cancelTargeting','setSquadMode','transferSoldier','focusAnt'])assert.match(js,new RegExp('actions\\.'+action));
 assert.match(css,/min-height:44px/);
});
