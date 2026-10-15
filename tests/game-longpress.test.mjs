import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('long hold does not select game HUD, map labels or action text',()=>{
  assert.match(html,/id="app"/);
  assert.match(css,/#app, #app \*\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;[^}]*-webkit-touch-callout:\s*none;/s);
  assert.match(runtime,/gameRoot\.addEventListener\('contextmenu', gameLongPressGuard\)/);
  assert.match(runtime,/gameRoot\.addEventListener\('selectstart', gameLongPressGuard\)/);
  assert.match(runtime,/if \(!editable\) event\.preventDefault\(\)/);
});
test('editable Seed/input/textarea fields retain selection, keyboard and paste',()=>{
  assert.match(css,/#app input, #app textarea, #app select,/);
  assert.match(css,/-webkit-user-select:\s*text;/);
  assert.match(css,/user-select:\s*text;/);
  assert.match(css,/-webkit-touch-callout:\s*default;/);
  assert.match(runtime,/input, textarea, select, \[contenteditable="true"\], \[contenteditable="plaintext-only"\]/);
  assert.match(html,/id="seed-input"/);
});
test('game pointer, touch and scroll behaviors are not intercepted globally',()=>{
  assert.doesNotMatch(runtime,/addEventListener\('touchstart'.*preventDefault/);
  assert.doesNotMatch(runtime,/addEventListener\('pointerdown', gameLongPressGuard/);
  assert.match(css,/#game-canvas\{[^}]*touch-action:none/s);
  assert.match(css,/\.colony-panel\{[^}]*touch-action:pan-y/s);
});
