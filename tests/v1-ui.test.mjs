import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/ui/visual/v1.css', import.meta.url), 'utf8');

test('V1 keeps U1-U3 controller bindings and adds only a visual stylesheet', () => {
  const original = '<link rel="stylesheet" href="./src/styles.css" />';
  const visual = '<link rel="stylesheet" href="./src/ui/visual/v1.css" />';
  assert.ok(index.includes(original) && index.includes(visual));
  assert.ok(index.indexOf(visual) > index.indexOf(original));
  assert.ok(index.includes('<script type="module" src="./src/main.js"></script>'));
  const ids = [
    'game-canvas','game-time','population','colony-button','colony-panel','close-colony',
    'report-workers','report-nurses','report-brood','report-message','brood-summary',
    'queen-status','alloc-nurse','alloc-nurse-label','nurse-count','seed-button','seed-label',
    'stock-carbs','stock-protein','stock-water',
    'region-name','region-subtitle','layer-hint','tool-inspect','tool-dig',
    'alloc-forage','alloc-forage-label','alloc-soldier','workforce-open','forage-count','worker-status','queue-status',
    'pause-button','zoom-in','zoom-out','recenter','debug-toggle','debug-panel',
    'selection-card','selection-close','selection-resource','selection-work',
    'selection-note','cancel-dig','portal-button','seed-dialog','seed-form',
    'seed-input','cancel-seed','toast','surface-button','underground-button'
  ];
  for (const id of ids) {
    const count = [...index.matchAll(/\bid="([^"]+)"/g)].filter(match => match[1] === id).length;
    assert.equal(count, 1, 'Expected exactly one #' + id);
  }
  for (const speed of [0,1,2,4]) {
    assert.match(index, new RegExp('data-speed="' + speed + '"'));
  }
  for (const layer of ['surface','underground']) {
    assert.match(index, new RegExp('data-layer="' + layer + '"'));
  }
});

test('V1 includes responsive, safe-area, reduced-motion and selection boundaries', () => {
  assert.match(theme, /max-width:\s*680px/);
  assert.match(theme, /max-width:\s*355px/);
  assert.match(theme, /max-height:\s*500px/);
  assert.match(theme, /prefers-reduced-motion:\s*reduce/);
  assert.match(theme, /safe-area-inset-bottom/);
  assert.match(theme, /\.selection-card\s*\{/);
  assert.match(theme, /\.debug-panel\s*\{/);
  assert.match(theme, /\.resource-stat/);
  assert.match(theme, /\.workforce-open/);
  assert.doesNotMatch(theme, /@import|url\s*\(\s*["']?https?:/i, 'Visual layer must not rely on remote files');
  assert.doesNotMatch(theme, /#game-canvas\s*\{/, 'Visual layer must not override canvas interaction');
});
