import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui/renovation/rooms.js';
const js=readFileSync(new URL('../src/ui/renovation/rooms.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/renovation/rooms.css',import.meta.url),'utf8');
test('UI-05 G1.0 uses map/room authoritative facade, not direct Engine or native UI',()=>{
 assert.equal(typeof mount,'function');
 for(const name of ['roomPlan','validateRoom','queueRoom','cancelRoom','inspectDig','queueDig','cancelDig'])
  assert.match(js,new RegExp('actions\\.'+name+'\\('));
 assert.doesNotMatch(js,/\b(?:alert|confirm|prompt|showPicker|setInterval|requestAnimationFrame)\s*\(/);
 assert.doesNotMatch(js,/\.game\.|\.lifecycle\.|\.colony\.|canvas\.addEventListener/);
 assert.match(js,/unsubscribe\(\)/);
});
test('UI-05 variable footprint, truthful errors, nonblocking geometry and accessible hit areas',()=>{
 assert.match(js,/getLimits\(\)\.maxWidth/);
 assert.match(js,/getLimits\(\)\.maxHeight/);
 assert.match(js,/getLimits\(\)\.minArea/);
 assert.match(js,/item\.status/);
 assert.match(js,/\['planned','building'\]/);
 assert.match(js,/actions\.validateRoom\(/);
 assert.match(css,/max-height:500px/);assert.match(css,/max-width:355px/);
 assert.match(css,/min-height:44px/);
 assert.doesNotMatch(css,/position:\s*fixed|z-index:\s*\d{3,}/);
});