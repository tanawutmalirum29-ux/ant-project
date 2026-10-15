import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html = source('index.html');
const script = source('src/ui/visual/game-choice.js');
const css = source('src/ui/visual/game-choice.css');
const room = source('src/ui/visual/room-picker.js');
const app = source('src/ui/app.js');

test('all visible game dropdowns use styled DOM choice buttons, never OS picker', () => {
  const selects = [...html.matchAll(/<select\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(selects.sort(),['nursery-level','nursery-profession','room-type'].sort());
  assert.match(html,/src\/ui\/visual\/game-choice\.css/);
  assert.match(html,/src\/ui\/visual\/game-choice\.js/);
  assert.match(html,/src\/ui\/visual\/room-picker\.js/);
  assert.match(script,/#app select:not\(#room-type\)/);
  assert.match(room,/room-picker-ready/);
  assert.match(css,/select\[data-game-choice="ready"\]/);
  assert.match(css,/pointer-events:none!important/);
  assert.match(script,/select\.dataset\.gameChoice = 'ready'/);
});

test('Nursery professions and levels remain authoritative values in lifecycle', () => {
  for(const name of ['nursery-profession','nursery-level']) {
    assert.match(html,new RegExp('id="'+name+'"'));
    assert.match(app,new RegExp("'"+name+"'"));
    assert.ok(script.includes("select.dispatchEvent(new Event('change'"));
  }
  for(const job of ['miner','forager','builder','nurse','soldier'])
    assert.match(html,new RegExp('option value="'+job+'"'));
  for(const n of [1,2,3,4,5])
    assert.match(html,new RegExp('option value="'+n+'"'));
});

test('game dropdown has real tap targets and keyboard/screen reader affordances', () => {
  assert.match(script,/document\.createElement\('button'\)/);
  assert.match(script,/aria-haspopup/);
  assert.match(script,/aria-expanded/);
  assert.match(script,/role', 'listbox'/);
  assert.match(script,/role', 'option'/);
  assert.match(script,/aria-selected/);
  assert.match(script,/ArrowDown/);
  assert.match(script,/ArrowUp/);
  assert.match(script,/Escape/);
  assert.match(script,/focusout/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area|overflow-y:auto/);
  assert.doesNotMatch(script,/\b(alert|prompt|confirm|showPicker)\(/);
});
