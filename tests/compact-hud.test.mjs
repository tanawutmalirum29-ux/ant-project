import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/visual/v3-compact.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/ui/app.js',import.meta.url),'utf8');
const startTag=id=>html.indexOf('id="'+id+'"');
test('HUD3-01 compact UI keeps all production gameplay controls and their original IDs',()=>{
  for(const id of [
    'game-canvas','tool-inspect','tool-dig','tool-room','room-palette','room-type','room-cost',
    'workforce-open','forage-count','nurse-count','colony-panel','colony-button','close-colony',
    'report-brood','report-workers','report-nurses','alloc-forage','alloc-nurse','alloc-soldier',
    'stock-carbs','stock-protein','stock-water','room-summary','worker-status','queue-status',
    'u6-stub','selection-card','selection-close','selection-room','cancel-room','cancel-dig',
    'pause-button','debug-panel','debug-toggle','zoom-in','zoom-out','recenter',
    'seed-button','surface-button','underground-button'
  ].filter(x=>x!=='u6-stub')){
    assert.ok(startTag(id)>=0,id);
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id+' is duplicated');
  }
});
test('HUD3-02 resources are in header; detailed work info only in population panel',()=>{
  const header=html.indexOf('</header>'),resource=html.indexOf('class="resource-strip"');
  assert.ok(resource>html.indexOf('<header')&&resource<header,'stocks must join the topbar');
  const panelStart=html.indexOf('id="colony-panel"'),panelEnd=html.indexOf('</aside>',panelStart);
  for(const id of ['room-summary','worker-status','queue-status']){
    const pos=startTag(id);assert.ok(pos>panelStart&&pos<panelEnd,id+' must be in population panel');
  }
  assert.ok(css.includes('.dig-tools > .orders-status{display:none}'));
  assert.ok(css.includes('body #u6-dock'));
});
test('HUD3-03 V3 loads after V2 corrections and does not modify simulation input',()=>{
  const v2=html.indexOf('src/ui/visual/v2-fixes.css'),v3=html.indexOf('src/ui/visual/v3-compact.css');
  assert.ok(v3>v2);
  assert.doesNotMatch(css,/\#game-canvas\s*\{/,'map canvas input rules must remain untouched');
  assert.doesNotMatch(css,/@import|url\s*\(\s*["']?https?:/i);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces');
  for(const query of ['max-width:680px','max-width:355px','max-height:500px','safe-area-inset-bottom','prefers-reduced-motion']){
    assert.ok(css.includes(query),query);
  }
  assert.match(app,/queen-status'\)\.classList\.toggle\('is-alert',queenAlert\)/);
});
