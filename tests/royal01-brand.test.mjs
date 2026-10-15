import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const ui = ['colony', 'dig', 'explore', 'forage', 'nurse', 'surface', 'underground', 'water'];
const sprites = { brood: [140, 96], 'queen-ant': [156, 110], 'store-room': [180, 124], 'worker-ant': [120, 96] };
const paths = [...ui.map(name => 'assets/ui/' + name + '.svg'), ...Object.keys(sprites).map(name => 'assets/sprites/' + name + '.svg'), 'assets/logo.svg', 'assets/favicon.svg'];

function assertSimpleXml(svg, filename) {
  assert.match(svg, /^<svg\b[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/, filename);
  assert.match(svg, /<title>[^<]+<\/title>/, filename + ': title');
  assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|image|use)\b/i, filename + ': unsafe content');
  assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:\/\/|\b(?:href|xlink:href)\s*=/i, filename + ': remote dependency');
  const stack = [];
  for (const token of svg.match(/<[^>]+>/g) || []) {
    const m = token.match(/^<(\/)?([a-zA-Z][a-zA-Z0-9:-]*)\b/);
    assert.ok(m, filename + ': malformed tag ' + token);
    if (m[1]) assert.equal(stack.pop(), m[2], filename + ': nesting');
    else if (!token.endsWith('/>')) stack.push(m[2]);
  }
  assert.deepEqual(stack, [], filename + ': unclosed tags');
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
  assert.match(svg, /<\/svg>\s*$/);
  for (const [, color] of svg.matchAll(/\b(?:stroke|fill)\s*=\s*"([^"]+)"/g)) {
    assert.match(color, /^(?:none|#[0-9a-f]{6})$/i, filename + ': literal palette color');
  }
}

test('ROYAL-01 all 14 SVG files are self-contained and structurally nested', () => {
  assert.equal(paths.length, 14);
  for (const path of paths) assertSimpleXml(read(path), path);
});

test('ROYAL-01 original sprite dimensions, viewBox and anchors remain intact', () => {
  const manifest = JSON.parse(read('assets/sprites/manifest.json'));
  assert.equal(manifest.version, 2);
  for (const [name, [width, height]] of Object.entries(sprites)) {
    const svg = read('assets/sprites/' + name + '.svg');
    assert.match(svg, new RegExp('width="' + width + '"'));
    assert.match(svg, new RegExp('height="' + height + '"'));
    assert.match(svg, new RegExp('viewBox="0 0 ' + width + ' ' + height + '"'));
    const sprite = manifest.sprites.find(s => s.id === name);
    assert.ok(sprite, name + ': missing manifest entry');
    assert.deepEqual(sprite.size, [width, height]);
    assert.ok(Array.isArray(sprite.anchor) && sprite.anchor.length === 2);
  }
  for (const name of ui) {
    assert.match(read('assets/ui/' + name + '.svg'), /width="64" height="64" viewBox="0 0 64 64"/);
  }
});

test('ROYAL-01 theme, favicon, DOM bindings and loading order remain stable', () => {
  assert.match(html, /<meta name="theme-color" content="#0d1a15"\s*\/>/);
  assert.match(html, /<link rel="icon" href="\.\/assets\/favicon.svg" type="image\/svg\+xml"\s*\/>/);
  assert.match(html, /<div class="brand-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none">/);
  const scripts = ['./src/main.js', './src/ui/visual/page-zoom-guard.js', './src/ui/visual/room-picker.js', './src/ui/visual/game-choice.js'];
  const actualScripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(actualScripts, scripts);
  const css = ['./src/styles.css', './src/ui/visual/v1.css', './src/ui/visual/v2.css', './src/ui/visual/v2-fixes.css', './src/ui/visual/v3-compact.css', './src/ui/visual/inspector.css', './src/ui/visual/nursery.css', './src/ui/visual/game-choice.css', './src/ui/renovation/shell.css', './src/ui/renovation/home.css', './src/ui/renovation/settings.css', './src/ui/renovation/military.css', './src/ui/renovation/ants.css', './src/ui/renovation/nursery.css', './src/ui/renovation/rooms.css'];
  const actualCss = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(actualCss, css);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'No duplicate IDs');
  for (const id of ['game-canvas', 'stock-carbs', 'stock-protein', 'stock-water', 'colony-button', 'selection-card', 'debug-toggle', 'tool-dig', 'surface-button', 'underground-button', 'zoom-in', 'zoom-out', 'recenter']) {
    assert.ok(ids.includes(id), 'Missing JS selector: ' + id);
  }
});

test('ROYAL-01 inline header, logo and favicon share the crowned ant crest', () => {
  const motif = 'M28 18v-7l4 3 3-6 3 6 4-3v7H28z';
  for (const src of [html, read('assets/logo.svg'), read('assets/favicon.svg')]) {
    assert.ok(src.includes(motif));
    assert.ok(src.includes('#3a2a1c'));
    assert.ok(src.includes('#e2bb7a'));
  }
});
