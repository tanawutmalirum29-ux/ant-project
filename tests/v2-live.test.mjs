import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=src('index.html'),skin=src('src/ui/visual/v2.css');
test('Live UI integration includes V2 after V1 and no duplicated element IDs',()=>{
 const base='./src/styles.css',v1='./src/ui/visual/v1.css',v2='./src/ui/visual/v2.css';
 assert.ok(html.includes(base)&&html.includes(v1)&&html.includes(v2));
 assert.ok(html.indexOf(base)<html.indexOf(v1)&&html.indexOf(v1)<html.indexOf(v2));
 assert.equal((html.match(/src\/ui\/visual\/v2.css/g)||[]).length,1);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['tool-room','room-type','room-palette','room-cost','room-summary','selection-room',
 'cancel-room','tool-dig','forage-count','nurse-count','colony-button','debug-toggle',
 'seed-button','surface-button','underground-button'])assert.ok(ids.includes(id),'Missing #'+id);
});
test('V2 styles U5 room-picker without editing gameplay code',()=>{
 for(const token of ['.tool-switch:has(#tool-room)', '.room-palette', '#room-summary','.selection-room',
 'grid-template-columns:repeat(3,minmax(0,1fr))','room-palette:not(.hidden)',
 'safe-area-inset-bottom'])assert.ok(skin.includes(token),token);
 assert.ok(statSync(new URL('../src/ui/visual/v2.css',import.meta.url)).size>10000);
 assert.doesNotMatch(skin,/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/);
});
