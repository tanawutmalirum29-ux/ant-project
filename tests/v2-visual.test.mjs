import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const prod=read('index.html'), demo=read('design/v2/index.html'), css=read('src/ui/visual/v2.css'), preview=read('design/v2/preview.js');

test('V2 live skin preserves U1-U4 selectors and U5 game bindings',()=>{
 assert.ok(prod.includes('./src/ui/visual/v1.css'));
 assert.ok(prod.includes('./src/ui/visual/v2.css'), 'integrated V2 must be loaded in production');
 const a=[...prod.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
 const b=[...demo.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
 assert.equal(new Set(a).size,a.length,'Production element IDs are unique');
 assert.equal(new Set(b).size,b.length,'Preview element IDs are unique');
 for(const id of b)assert.ok(a.includes(id),'Live game lost a V2 preview U1-U4 selector: '+id);
 for(const id of ['tool-room','room-palette','room-type','room-cost','room-summary','selection-room','cancel-room'])assert.ok(a.includes(id),'Missing U5 integration control: '+id);
 const required=['game-canvas','game-time','stock-carbs','stock-protein','stock-water','population','colony-button',
 'colony-panel','tool-inspect','tool-dig','workforce-open','alloc-forage','alloc-nurse','surface-button','underground-button',
 'debug-panel','selection-card','seed-dialog','seed-button','pause-button'];
 for(const id of required)assert.ok(a.includes(id),'Missing existing live control: '+id);
});
test('V2 has explicit responsive and accessible states, without simulation hooks',()=>{
 for(const term of ['.topbar','.resource-strip','.dig-tools','.layer-switch','.selection-card',
 '.colony-panel','.workforce-open','.workforce-editor','.debug-panel','.speed-btn','safe-area-inset-bottom',
 'prefers-reduced-motion','max-width:680px','max-height:500px','max-width:355px',
 '44px']) assert.ok(css.includes(term),'Missing V2 visual contract: '+term);
 assert.doesNotMatch(css,/@import|url\s*\(\s*["']?https?:|#game-canvas\s*\{/i);
 assert.doesNotMatch(preview,/\b(?:import|fetch)\s*\(|\bWebSocket\b/);
 assert.ok(demo.includes('ข้อมูลจำลอง ไม่ใช่เกมจริง'));
 const opener=(css.match(/{/g)||[]).length,closer=(css.match(/}/g)||[]).length;
 assert.equal(opener,closer,'CSS selector declaration brackets must balance');
});
test('V2 preview references the original visual artifacts without remote assets',()=>{
 for(const path of ['design/v2/index.html','design/v2/preview.css','design/v2/preview.js',
 'src/ui/visual/v2.css']) assert.ok(existsSync(resolve(root,path)),path);
 for(const marker of ['../../src/styles.css','../../src/ui/visual/v1.css',
 '../../src/ui/visual/v2.css','./preview.css','./preview.js']){
  assert.ok(demo.includes(marker),marker);
 }
 for(const path of ['../../assets/sprites/queen-ant.svg','../../assets/sprites/brood.svg',
 '../../assets/sprites/store-room.svg','../../assets/sprites/worker-ant.svg']){
  assert.ok(demo.includes(path),path);
  assert.ok(existsSync(resolve(root,'design/v2',path)),path);
 }
 assert.doesNotMatch(demo,/<script[^>]+src="\.\.\/\.\.\/src\/main\.js"/);
});
test('Original SVG asset kit has a valid viewBox and self-contained content',()=>{
 for(const key of ['explore','dig','colony','forage','nurse','surface','underground','water']){
  const source=read('assets/ui/'+key+'.svg');
  assert.match(source,/^<svg[^>]+viewBox="0 0 64 64"/);
  assert.match(source,/<\/svg>\s*$/);
  assert.doesNotMatch(source,/<script|<foreignObject|(?:href|src) *= *["']https?:/i);
 }
 const manifest=JSON.parse(read('assets/sprites/manifest.json'));
 assert.equal(manifest.version,2);
 assert.equal(manifest.sprites.length,4);
 for(const sprite of manifest.sprites){
  const path='assets/sprites/'+sprite.path;
  const source=read(path);
  assert.match(source,/<svg/);
  assert.ok(source.includes('viewBox='));
  assert.equal(sprite.size.length,2);
  assert.equal(sprite.anchor.length,2);
  assert.ok(!source.includes('<script'));
 }
});
test('V2 visual hierarchy is materially different from V1',()=>{
 const before=read('src/ui/visual/v1.css');
 assert.ok(css.length>10000);
 assert.ok(css.includes('OPERATIONS  /  คำสั่งอาณาจักร'));
 assert.ok(css.includes('grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)'));
 assert.ok(!before.includes('OPERATIONS  /  คำสั่งอาณาจักร'));
 assert.ok(!before.includes('grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)'));
});
