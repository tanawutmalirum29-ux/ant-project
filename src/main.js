import { Game } from './core/game.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/app.js';
import { CombatControls } from './ui/combat-controls.js';
import { MilestonesPanel } from './ui/milestones-panel.js';
import { SURFACE, UNDERGROUND } from './world/generate.js';
import { createRenovationShell } from './ui/renovation/shell.js';
import { UIRenovationAdapter } from './ui/renovation/ui-adapter.js';
import { mountEngineerA } from './ui/renovation/integrate-a.js';
import { mountEngineerB } from './ui/renovation/integrate-b.js';
import { mountEngineerC } from './ui/renovation/integrate-c.js';

// Suppress browser context menus and selection handles on game UI only.
// Do not cancel touchstart/pointerdown: the map, scrolling panels and buttons
// still need native taps, drags, gestures and keyboard focus.
const gameLongPressGuard = event => {
  const target = event.target;
  const editable = target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (!editable) event.preventDefault();
};
const gameRoot = document.getElementById('app');
gameRoot.addEventListener('contextmenu', gameLongPressGuard);
gameRoot.addEventListener('selectstart', gameLongPressGuard);

const query = new URLSearchParams(location.search);
const initialSeed = (query.get('seed') || 'ANT-001').slice(0, 40);
let game = new Game(initialSeed);
let cameras = createCameras(game);
const renderer = new Renderer(document.getElementById('game-canvas'));
let milestonesPanel = null;
renderer.resize();
const ui = new UI(game, cameras, renderer, (seed) => {
  game = new Game(seed);
  cameras = createCameras(game);
  ui.game = game;
  ui.cameras = cameras;
  milestonesPanel?.setGame(game);
  try {
    const search = new URLSearchParams({seed});
    if (query.get('ui') === 'renovation') search.set('ui','renovation');
    history.replaceState(null, '', `${location.pathname}?${search.toString()}`);
  } catch { /* file URL context */ }
});
const combatControls = new CombatControls(ui);
// G1 foundation is deliberately dormant until six feature views are integrated.
const renovationShell = createRenovationShell();
const renovationAdapter = new UIRenovationAdapter({ui,combatControls,overlay:renovationShell.overlay});
// Stage actual A modules against real gameplay without exposing an incomplete UI.
const renovationA = mountEngineerA(renovationShell,renovationAdapter);
const renovationB = mountEngineerB(renovationShell,renovationAdapter);
const renovationC = mountEngineerC(renovationShell,renovationAdapter);
// G3 QA ONLY: opt-in to the complete staged shell without changing the default
// player interface. Exact real-pointer/browser evidence gates normal rollout.
const renovationQaActive = query.get('ui') === 'renovation';
if (renovationQaActive) {
  gameRoot.dataset.uiRenovationQa = 'true';
  renovationShell.preview(true);
}

milestonesPanel = new MilestonesPanel(game, {
  onOpen: () => {
    // A report and an active drag/room picker must not compete for touch targets.
    ui.setTool('inspect');
    ui.select(null);
  }
});
// Outside controls and map input dismiss the nonmodal report before a new
// action (including a keyboard-activated button) displays its own controls.
const dismissMilestonesForOutsideAction = event => {
  if (!event.target?.closest?.('#milestones-panel, #milestones-toggle')) {
    milestonesPanel.setOpen(false);
  }
};
document.addEventListener('pointerdown', dismissMilestonesForOutsideAction, { capture: true });
document.addEventListener('click', dismissMilestonesForOutsideAction, { capture: true });
function createCameras(gameState) {
  const e = gameState.world.entrances[0];
  return { [SURFACE]: new Camera(SURFACE, e.surface), [UNDERGROUND]: new Camera(UNDERGROUND, e.underground) };
}
const onResize = () => {
  renderer.resize();
  for (const layer of [SURFACE, UNDERGROUND]) cameras[layer].clamp(game.world.layers[layer], renderer.width, renderer.height);
};
new ResizeObserver(onResize).observe(renderer.canvas);
window.addEventListener('orientationchange', onResize);
onResize();
let lastFrame = performance.now(), statsWindowStart = lastFrame, frames = 0, steps = 0, lastHud = 0;
function frame(now) {
  const dt = Math.max(0, now - lastFrame);
  lastFrame = now;
  const s = performance.now();
  steps += game.update(dt);
  const simMs = performance.now() - s;
  const r = performance.now();
  renderer.render(game, cameras[game.layer], ui.selection, now, ui.digPreview, ui.roomPreview, ui.tool==='room'?document.getElementById('room-type').value:null);
  game.metrics.simMs = simMs;
  game.metrics.renderMs = performance.now() - r;
  frames++;
  if (now - statsWindowStart >= 1000) {
    const elapsed = (now - statsWindowStart) / 1000;
    game.metrics.fps = Math.round(frames / elapsed);
    game.metrics.tps = Math.round(steps / elapsed);
    frames = 0;
    steps = 0;
    statsWindowStart = now;
  }
  if (now - lastHud > 150) { ui.updateMetrics(); combatControls.update(); milestonesPanel.render(); renovationAdapter.notify(); lastHud = now; }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastFrame = performance.now();
});
requestAnimationFrame(frame);
// Opt-in diagnostics in the browser console, never a second game loop.
window.__ANT_DEBUG__ = { get game() { return game; }, get cameras() { return cameras; }, get ui() { return ui; }, renderer, renovationShell, renovationAdapter, renovationA, renovationB, renovationC };
