import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = src('index.html');
const css = src('src/ui/visual/v2-fixes.css');
const room = src('src/ui/visual/room-picker.js');
const guard = src('src/ui/visual/page-zoom-guard.js');

test('UI selection fix loads after V2 and preserves map/game entry', () => {
  for (const path of ['src/styles.css','src/ui/visual/v1.css','src/ui/visual/v2.css','src/ui/visual/v2-fixes.css']) {
    assert.ok(html.includes(path), 'Missing stylesheet: '+path);
  }
  assert.ok(html.indexOf('v1.css') < html.indexOf('v2.css'));
  assert.ok(html.indexOf('v2.css') < html.indexOf('v2-fixes.css'));
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.match(html, /src\/ui\/visual\/room-picker\.js/);
  assert.match(html, /src\/ui\/visual\/page-zoom-guard\.js/);
  assert.match(html, /<select id="room-type"/);
  for (const id of ['tool-room','room-type','room-cost','selection-card','debug-panel','zoom-in','zoom-out','recenter','game-canvas']) {
    assert.equal([...html.matchAll(/\bid="([^"]+)"/g)].filter(m=>m[1]===id).length,1,id);
  }
});

test('Web page pinch zoom is disabled while canvas zoom remains bound to gameplay', () => {
  assert.match(html, /maximum-scale=1/);
  assert.match(html, /user-scalable=no/);
  assert.match(css, /#game-canvas\s*\{\s*touch-action:none/);
  assert.match(guard, /gesturestart/);
  assert.match(guard, /event\.touches\.length > 1/);
  assert.match(guard, /event\.ctrlKey \|\| event\.metaKey/);
  const app = src('src/ui/app.js');
  assert.match(app, /camera\.zoomAt\(next\.distance\s*\/\s*pinch\.distance/);
  assert.match(app, /el\.addEventListener\('wheel'/);
});

test('Room picker is presentation-only and delegates to original select', () => {
  assert.match(room, /document\.getElementById\('room-type'\)/);
  assert.match(room, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(room, /select\.addEventListener\('change', sync\)/);
  assert.match(room, /MutationObserver/);
  assert.match(css, /\.room-picker-options\[hidden\]/);
  assert.match(css, /\.room-palette\.room-picker-ready select#room-type/);
  assert.doesNotMatch(room, /\bimport\b|\bfetch\s*\(|__ANT_DEBUG__|\.game\.|\bRooms\b/);
});

test('Selection info and right controls have separate responsive placement rules', () => {
  assert.match(css, /min-width:681px/);
  assert.match(css, /max-width:680px/);
  assert.match(css, /max-height:500px/);
  assert.match(css, /#app:has\(\.debug-panel:not\(\.hidden\)\) \.selection-card:not\(\.hidden\)/);
  assert.match(css, /visibility:hidden;pointer-events:none/);
});
