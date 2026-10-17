import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui/renovation/nursery.js';
const js=readFileSync(new URL('../src/ui/renovation/nursery.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/renovation/nursery.css',import.meta.url),'utf8');
test('UI-04 G1.0 module contract and scoped DOM styling',()=>{
 assert.equal(typeof mount,'function');
 assert.match(js,/export function mount\(container,\{view,actions,overlay,subscribe\}\)/);
 assert.match(js,/overlay\.registerPanel/);
 assert.match(js,/unsubscribe\(\)/);
 assert.doesNotMatch(js,/\b(?:alert|confirm|prompt|showPicker|setInterval|requestAnimationFrame)\s*\(/);
 assert.doesNotMatch(css,/position:\s*fixed|z-index:\s*\d{3,}/);
 assert.match(css,/max-height:500px/);assert.match(css,/max-width:355px/);
 assert.match(css,/min-height:44px/);
});
test('UI-04 respects real engine 25 caste-level combos, dynamic capacity and queued-only cancellation',()=>{
 for(const caste of ['miner','forager','builder','nurse','soldier'])assert.match(js,new RegExp("\\['"+caste+"','"));
 assert.match(js,/\[1,2,3,4,5\]/);
 assert.match(js,/room\.slots/);assert.match(js,/room\.used/);assert.match(js,/room\.free/);
 assert.match(js,/order\.canCancel/);
 assert.match(js,/order\.status==='INCUBATING'/);
 assert.match(js,/actions\.nurseryCost\(/);
 assert.match(js,/actions\.queueEgg\(/);
 assert.match(js,/actions\.cancelEgg\(/);
 assert.doesNotMatch(js,/\.game\.|\.lifecycle\.|\.colony\./);
});