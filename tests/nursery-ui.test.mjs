import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=source('index.html'),app=source('src/ui/app.js'),skin=source('src/ui/visual/nursery.css'),browser=source('tools/browser-nursery.py');
test('Nursery track C: 5 immutable profession options and five levels wired to real lifecycle API',()=>{
 const profession=html.match(/<select id="nursery-profession">([\s\S]*?)<\/select>/)?.[1]??'';
 const level=html.match(/<select id="nursery-level">([\s\S]*?)<\/select>/)?.[1]??'';
 for(const kind of ['miner','forager','builder','nurse','soldier'])assert.match(profession,new RegExp('value="'+kind+'"'));
 assert.equal((profession.match(/<option /g)||[]).length,5);
 assert.deepEqual([...level.matchAll(/<option value="(\d)">/g)].map(m=>Number(m[1])),[1,2,3,4,5]);
 for(const method of ['queueEgg','cancelEgg','nurseryStatus','eggCost'])assert.match(app,new RegExp('life\\?\\.'+method+'|lifecycle\\?\\.'+method));
 assert.doesNotMatch(app,/\b(?:window\.)?(?:alert|prompt|confirm)\s*\(/);
});
test('Nursery track C: accessible controls, clear disabled reason, incubation progress and cancellation',()=>{
 for(const id of ['nursery-panel','nursery-blocked','nursery-queue','nursery-orders','nursery-reopen','nursery-feedback'])
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 assert.match(html,/id="nursery-queue" aria-describedby="nursery-cost nursery-blocked"/);
 assert.match(app,/status\.free<=0/);
 assert.match(app,/order\.status==='QUEUED'/);
 assert.match(app,/document\.createElement\('progress'\)/);
 assert.match(app,/remainingTicks/);
 assert.match(app,/if\(e\.code==='Escape'/);
 assert.match(skin,/body:has\(\.nursery-panel:not\(\.hidden\)\) #selection-card/);
 assert.match(skin,/body:has\(#u6-dialog\[open\]\)/);
});
test('Nursery track C: responsive and persistent profession/level roster without share mutation',()=>{
 assert.match(skin,/@media\(max-width:600px\)/);
 assert.match(skin,/@media\(max-width:355px\)/);
 assert.match(skin,/safe-area-inset-bottom/);
 assert.match(app,/this\.casteSignature/);
 assert.match(app,/for\(const \[kind,name\] of Object\.entries\(names\)\)/);
 assert.doesNotMatch(app,/workforce\.setShare\(/);
 assert.match(browser,/intersects\(box,dock\.bounding_box\(\)\)/);
 assert.match(browser,/has_touch=True/);
 assert.match(browser,/page\.touchscreen\.tap/);
 for(const dimension of ['320,568','390,844','1440,900'])assert.ok(browser.includes(dimension),dimension);
});
