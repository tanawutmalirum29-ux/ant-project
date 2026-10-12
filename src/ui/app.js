import { SURFACE, UNDERGROUND, cellAt, portalAt } from '../world/generate.js';
import { formatGameTime } from '../core/time.js';
import { terrainName } from '../render/renderer.js';
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, cameras, renderer, onNewWorld) {
    this.game = game;
    this.cameras = cameras;
    this.renderer = renderer;
    this.onNewWorld = onNewWorld;
    this.selection = null;
    this.debug = false;
    this.toastTimer = null;
    this.lastSpeed = 1;
    this.bind();
    this.updateWorld();
    this.updateMetrics();
  }
  get camera() { return this.cameras[this.game.layer]; }
  dimensions() { return [this.renderer.width, this.renderer.height]; }
  bind() {
    for (const btn of document.querySelectorAll('[data-layer]')) {
      btn.addEventListener('click', () => this.switchLayer(btn.dataset.layer));
    }
    for (const btn of document.querySelectorAll('[data-speed]')) {
      btn.addEventListener('click', () => this.changeSpeed(Number(btn.dataset.speed)));
    }
    $('zoom-in').addEventListener('click', () => this.zoom(1.25));
    $('zoom-out').addEventListener('click', () => this.zoom(1 / 1.25));
    $('recenter').addEventListener('click', () => this.recenter());
    $('debug-toggle').addEventListener('click', () => { this.debug = !this.debug; $('debug-panel').classList.toggle('hidden', !this.debug); });
    $('selection-close').addEventListener('click', () => this.select(null));
    $('portal-button').addEventListener('click', () => {
      if (this.selection && portalAt(this.game.world, this.game.layer, this.selection.x, this.selection.y)) this.switchLayer(this.game.layer === SURFACE ? UNDERGROUND : SURFACE);
    });
    $('seed-button').addEventListener('click', () => { $('seed-input').value = this.game.world.seedLabel; $('seed-dialog').showModal(); });
    $('cancel-seed').addEventListener('click', () => $('seed-dialog').close());
    $('seed-form').addEventListener('submit', e => {
      e.preventDefault();
      const seed = $('seed-input').value.trim();
      if (!seed) return;
      $('seed-dialog').close();
      this.onNewWorld(seed);
      this.select(null);
      this.updateWorld();
      this.notice('สร้างโลกใหม่สำเร็จ');
    });
    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.matches('input,textarea') || $('seed-dialog').open) return;
      if (e.code === 'Space') { e.preventDefault(); this.changeSpeed(this.game.clock.speed === 0 ? this.lastSpeed : 0); }
      if (e.code === 'Digit1') this.switchLayer(SURFACE);
      if (e.code === 'Digit2') this.switchLayer(UNDERGROUND);
      if (e.code === 'KeyD') { this.debug = !this.debug; $('debug-panel').classList.toggle('hidden', !this.debug); }
    });
    this.bindCanvas();
  }
  bindCanvas() {
    const el = this.renderer.canvas;
    const pointers = new Map();
    let pinch = null, dragDistance = 0, start = null;
    const loc = e => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const pinchInfo = () => {
      const [a, b] = [...pointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const point = loc(e);
      pointers.set(e.pointerId, point);
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { start = point; dragDistance = 0; pinch = null; }
      if (pointers.size === 2) { pinch = pinchInfo(); start = null; }
    });
    el.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const old = pointers.get(e.pointerId), point = loc(e);
      pointers.set(e.pointerId, point);
      const camera = this.camera, layer = this.game.currentLayer;
      if (pointers.size >= 2) {
        const next = pinchInfo();
        if (pinch && pinch.distance > 0) {
          camera.pan(next.x - pinch.x, next.y - pinch.y, layer, ...this.dimensions());
          camera.zoomAt(next.distance / pinch.distance, next.x, next.y, layer, ...this.dimensions());
        }
        pinch = next;
      } else if (pointers.size === 1) {
        const dx = point.x - old.x, dy = point.y - old.y;
        dragDistance += Math.hypot(dx, dy);
        camera.pan(dx, dy, layer, ...this.dimensions());
      }
    });
    const finish = (e, cancelled = false) => {
      if (!pointers.has(e.pointerId)) return;
      const point = loc(e);
      pointers.delete(e.pointerId);
      if (!cancelled && pointers.size === 0 && start && dragDistance < 7) {
        const cell = this.camera.screenToCell(point.x, point.y, ...this.dimensions());
        this.select(cellAt(this.game.currentLayer, cell.x, cell.y) != null ? { layer: this.game.layer, ...cell } : null);
      }
      if (pointers.size === 1) { start = null; pinch = null; }
      if (pointers.size === 0) { pinch = null; start = null; }
    };
    el.addEventListener('pointerup', e => finish(e));
    el.addEventListener('pointercancel', e => finish(e, true));
    el.addEventListener('lostpointercapture', e => finish(e, true));
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const p = loc(e);
      this.camera.zoomAt(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * .0017), p.x, p.y, this.game.currentLayer, ...this.dimensions());
    }, { passive: false });
  }
  switchLayer(layer) {
    this.game.setLayer(layer);
    this.select(null);
    this.updateWorld();
  }
  changeSpeed(speed) {
    if (speed > 0) this.lastSpeed = speed;
    this.game.setSpeed(speed);
    this.updateWorld();
  }
  recenter() {
    const target = this.game.world.entrances[0][this.game.layer];
    this.camera.x = (target.x + .5) * 28;
    this.camera.y = (target.y + .5) * 28;
    this.camera.clamp(this.game.currentLayer, ...this.dimensions());
  }
  zoom(factor) {
    const [w, h] = this.dimensions();
    this.camera.zoomAt(factor, w / 2, h / 2, this.game.currentLayer, w, h);
  }
  select(selection) {
    this.selection = selection;
    $('selection-card').classList.toggle('hidden', !selection);
    if (selection) {
      $('selection-terrain').textContent = terrainName(cellAt(this.game.currentLayer, selection.x, selection.y));
      $('selection-coords').textContent = `ตำแหน่ง X:${selection.x}  Y:${selection.y}`;
      $('portal-button').classList.toggle('hidden', !portalAt(this.game.world, selection.layer, selection.x, selection.y));
    }
  }
  notice(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2300);
  }
  updateWorld() {
    const surface = this.game.layer === SURFACE;
    $('region-name').textContent = surface ? 'เหนือผืนป่า' : 'ใต้ผืนดิน';
    $('region-subtitle').textContent = surface ? 'ทุ่งหาอาหารและโลกภายนอก' : 'อุโมงค์แห่งอาณาจักรเริ่มต้น';
    $('layer-hint').textContent = surface ? 'ค้นพบเส้นทางใหม่บนผืนดิน' : 'สำรวจโครงสร้างภายในรัง';
    $('seed-label').textContent = this.game.world.seedLabel;
    $('seed-label').title = this.game.world.seedLabel;
    $('population').textContent = this.game.population;
    for (const btn of document.querySelectorAll('[data-layer]')) {
      const active = btn.dataset.layer === this.game.layer;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    for (const btn of document.querySelectorAll('[data-speed]')) {
      const active = Number(btn.dataset.speed) === this.game.clock.speed;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }
  updateMetrics() {
    $('game-time').textContent = formatGameTime(this.game.clock);
    if (!this.debug) return;
    const m = this.game.metrics;
    $('metric-fps').textContent = String(m.fps);
    $('metric-tps').textContent = String(m.tps);
    $('metric-sim').textContent = `${m.simMs.toFixed(2)} ms`;
    $('metric-render').textContent = `${m.renderMs.toFixed(2)} ms`;
    $('metric-ticks').textContent = this.game.clock.ticks.toLocaleString('en-US');
    $('metric-pending').textContent = String(m.pendingTasks);
    $('metric-camera').textContent = `${Math.round(this.camera.x / 28)}, ${Math.round(this.camera.y / 28)} · ${this.camera.zoom.toFixed(2)}×`;
    $('metric-layer').textContent = this.game.layer;
  }
}
