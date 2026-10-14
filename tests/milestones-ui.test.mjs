import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MilestonesPanel, stageProgressLines } from '../src/ui/milestones-panel.js';

class MockNode {
  constructor(tag, doc) {
    this.tagName = tag;
    this.document = doc;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.textContent = '';
    this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), contains: name => this.classes.has(name) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  focus() { this.document.activeElement = this; }
  fire(name, event = {}) { this.listeners[name]?.(event); }
}
function fixture(initial) {
  const doc = { nodes: new Map(), activeElement: null };
  doc.createElement = tag => new MockNode(tag, doc);
  doc.getElementById = id => {
    if (!doc.nodes.has(id)) doc.nodes.set(id, new MockNode(id, doc));
    return doc.nodes.get(id);
  };
  const game = {
    reads: 0, writes: 0, ticks: 0,
    update() { this.ticks++; },
    milestones: { getSnapshot() { game.reads++; return initial; } }
  };
  const panel = new MilestonesPanel(game, { document: doc });
  return { doc, game, panel, toggle: doc.getElementById('milestones-toggle'),
    root: doc.getElementById('milestones-panel'), close: doc.getElementById('milestones-close'),
    summary: doc.getElementById('milestones-summary'), list: doc.getElementById('milestones-list') };
}
const makeSnapshot = (partial = {}) => {
  const s = {
    version: 1, tick: 0, activeStage: 0, allComplete: false,
    stages: [
      { id: 'stock-and-dig', title: 'จัดหาเสบียงและขุดอุโมงค์', complete: false, completedTick: null,
        progress: { carbsSeen: false, proteinSeen: false, waterSeen: false, digCompleted: false } },
      { id: 'nursery-and-workers', title: 'ขยายรังและแรงงาน', complete: false, completedTick: null,
        progress: { nurseryReadyConnected: false, livingWorkers: 5, requiredWorkers: 8 } },
      { id: 'defend-queen', title: 'ปกป้องนางพญา', complete: false, completedTick: null,
        progress: { enemyDefeated: false, queenAlive: true } }
    ]
  };
  return { ...s, ...partial };
};
function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
const text = node => [node.textContent, ...node.children.flatMap(child => [text(child)])].join(' ');

test('Stage progress is a pure formatter of the frozen typed fields', () => {
  const s = freezeDeep(makeSnapshot());
  assert.equal(stageProgressLines(s.stages[0]).length, 4);
  assert.deepEqual(stageProgressLines(s.stages[1]).at(-1),
    { label: 'มดงานมีชีวิต', value: '5 / 8 ตัว' });
  assert.match(stageProgressLines(s.stages[2])[1].value, /สำเร็จ/);
  assert.equal(stageProgressLines({ id: 'future', progress: {} }).length, 0);
  assert.equal(s.stages[0].progress.carbsSeen, false);
});

test('initial tick0 snapshot renders ordered Thai stages and truthful pending status', () => {
  const s = freezeDeep(makeSnapshot());
  const f = fixture(s);
  assert.equal(f.list.children.length, 3);
  assert.match(f.summary.textContent, /ขั้น 1 จาก 3/);
  assert.equal(f.doc.getElementById('milestones-tick').textContent, 'ติ๊กจำลอง 0');
  assert.equal(f.list.children[0].attributes['aria-current'], 'step');
  assert.match(text(f.list.children[0]), /อาหาร|พลังงาน/);
  assert.match(text(f.list.children[1]), /ยังไม่ปลดล็อก/);
  assert.equal(f.game.ticks, 0);
  assert.equal(f.game.writes, 0);
});

test('completed stage and activeStage show completedTick without revocation or fabricated logic', () => {
  const s = makeSnapshot({ tick: 48, activeStage: 1 });
  s.stages[0].complete = true;
  s.stages[0].completedTick = 12;
  s.stages[0].progress = { carbsSeen: true, proteinSeen: true, waterSeen: true, digCompleted: true };
  s.stages[1].progress.livingWorkers = 7;
  const f = fixture(freezeDeep(s));
  assert.ok(f.list.children[0].classes.has('is-complete'));
  assert.equal(f.list.children[1].attributes['aria-current'], 'step');
  assert.match(text(f.list.children[0]), /สำเร็จที่ติ๊ก 12/);
  assert.match(text(f.list.children[1]), /7 \/ 8/);
  assert.equal(f.list.children[2].attributes['aria-current'], undefined);
  assert.equal(f.game.ticks, 0);
});

test('allComplete and independent completedTick values render from snapshot only', () => {
  const s = makeSnapshot({ tick: 160, activeStage: null, allComplete: true });
  s.stages.forEach((stage, i) => { stage.complete = true; stage.completedTick = 30 + i * 20; });
  const f = fixture(freezeDeep(s));
  assert.match(f.summary.textContent, /ทั้ง 3 ขั้นสำเร็จ/);
  assert.equal(f.list.children.filter(node => node.classes.has('is-complete')).length, 3);
  assert.equal(f.list.children.filter(node => node.attributes['aria-current'] === 'step').length, 0);
  assert.match(text(f.list.children[2]), /ติ๊ก 70/);
});

test('CSS/DOM toggle, close, Escape and native button focus/ARIA work without dialogs', () => {
  const f = fixture(freezeDeep(makeSnapshot()));
  f.root.hidden = true; // matches [hidden] in HTML at initial load
  f.toggle.setAttribute('aria-expanded', 'false');
  f.toggle.fire('click');
  assert.equal(f.root.hidden, false);
  assert.equal(f.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(f.doc.activeElement, f.close);
  let prevented = false;
  f.root.fire('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.root.hidden, true);
  assert.equal(f.doc.activeElement, f.toggle);
  assert.equal(f.toggle.getAttribute('aria-expanded'), 'false');
  f.toggle.fire('click');
  f.close.fire('click');
  assert.equal(f.root.hidden, true);
  assert.equal(f.doc.activeElement, f.toggle);
});

test('new Game(seed) immediately rebinds to tick0; old tracker is never read again', () => {
  const old = fixture(freezeDeep(makeSnapshot({tick:123})));
  const previousReads = old.game.reads;
  const nextSnapshot = freezeDeep(makeSnapshot({ tick: 0, activeStage: 0 }));
  let calls = 0;
  const newGame = { milestones: { getSnapshot() { calls++; return nextSnapshot; } },
    update() { throw new Error('panel must never advance simulation'); } };
  old.panel.setGame(newGame);
  assert.equal(old.panel.game, newGame);
  assert.equal(old.game.reads, previousReads);
  assert.equal(calls, 1);
  assert.equal(old.doc.getElementById('milestones-tick').textContent, 'ติ๊กจำลอง 0');
  old.panel.render();
  assert.equal(calls, 2, 'reads at HUD refresh without recreating unchanged DOM');
  assert.equal(old.list.children.length, 3);
});

test('startup is safe before Core tracker arrives and never invents milestones', () => {
  const f = fixture(freezeDeep(makeSnapshot()));
  f.panel.setGame({ world: {seedLabel:'ANT-NEW'} });
  assert.equal(f.list.children.length, 0);
  assert.match(f.summary.textContent, /กำลังเชื่อมต่อ/);
  assert.match(f.doc.getElementById('milestones-tick').textContent, /รอข้อมูล/);
  assert.equal(f.game.ticks, 0);
});

test('integration wiring stays on HUD cadence, retains scoped files and CSS control layering', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/visual/v3-compact.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/ui/milestones-panel.js', import.meta.url), 'utf8');
  assert.match(main, /milestonesPanel\?\.setGame\(game\)/);
  assert.match(main, /if \(now - lastHud > 150\).*milestonesPanel\.render\(\)/s);
  assert.match(html, /id="milestones-toggle"[^>]*aria-controls="milestones-panel"/);
  assert.match(html, /id="milestones-panel"[^>]*hidden/);
  assert.match(html, /id="milestones-list"/);
  assert.match(css, /\.milestones-panel\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*355px\)/);
  assert.match(css, /@media\s*\(max-height:\s*500px\)\s*and\s*\(orientation:\s*landscape\)/);
  assert.match(css, /milestones-panel[^\n]*\{[^}]*z-index:\s*4/s);
  assert.match(css, /\.milestones-toggle:focus-visible/);
  assert.doesNotMatch(js, /\b(?:setInterval|setTimeout|requestAnimationFrame|alert|prompt|confirm)\s*\(/);
  assert.doesNotMatch(js, /\.update\s*\(/);
});
