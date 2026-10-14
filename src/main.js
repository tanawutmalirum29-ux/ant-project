import { Game } from './core/game.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/app.js';
import { CombatControls } from './ui/combat-controls.js';
import { MilestonesPanel } from './ui/milestones-panel.js';
import { SURFACE, UNDERGROUND } from './world/generate.js';

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
  try { history.replaceState(null, '', `${location.pathname}?seed=${encodeURIComponent(seed)}`); } catch { /* file URL context */ }
});
const combatControls = new CombatControls(ui);
milestonesPanel = new MilestonesPanel(game, { onOpen: () => ui.select(null) });
// Opening the map (inspect, dig, soldier orders) dismisses the small HUD card.
renderer.canvas.addEventListener('pointerdown', () => milestonesPanel.setOpen(false));
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
  if (now - lastHud > 150) { ui.updateMetrics(); combatControls.update(); milestonesPanel.render(); lastHud = now; }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastFrame = performance.now();
});
requestAnimationFrame(frame);
// Opt-in diagnostics in the browser console, never a second game loop.
window.__ANT_DEBUG__ = { get game() { return game; }, get cameras() { return cameras; }, get ui() { return ui; }, renderer };
