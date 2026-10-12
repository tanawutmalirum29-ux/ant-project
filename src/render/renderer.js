import { TERRAINS, SURFACE, UNDERGROUND, TILE, cellAt } from '../world/generate.js';
import { tileHash } from '../core/random.js';

const colors = {
  [TERRAINS.GRASS]: '#344d38', [TERRAINS.DIRT]: '#685039', [TERRAINS.THICKET]: '#1c382c',
  [TERRAINS.WATER]: '#284e58', [TERRAINS.STONE]: '#53574b',
  [TERRAINS.SOIL]: '#493729', [TERRAINS.HARD_SOIL]: '#34291f', [TERRAINS.ROCK]: '#242725',
  [TERRAINS.TUNNEL]: '#a27d52', [TERRAINS.CHAMBER]: '#b48c5d', [TERRAINS.ENTRANCE]: '#9b7350'
};
const labelFor = {
  [TERRAINS.GRASS]: 'ทุ่งหญ้า', [TERRAINS.DIRT]: 'พื้นดิน', [TERRAINS.THICKET]: 'พุ่มไม้',
  [TERRAINS.WATER]: 'แหล่งน้ำ', [TERRAINS.STONE]: 'ก้อนหิน',
  [TERRAINS.SOIL]: 'ดิน', [TERRAINS.HARD_SOIL]: 'ดินแข็ง', [TERRAINS.ROCK]: 'ชั้นหิน',
  [TERRAINS.TUNNEL]: 'อุโมงค์', [TERRAINS.CHAMBER]: 'ห้องในรัง', [TERRAINS.ENTRANCE]: 'ปากรัง'
};
export function terrainName(value) { return labelFor[value] ?? 'นอกแผนที่'; }
function clamp(a, min, max) { return Math.max(min, Math.min(max, a)); }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D unavailable');
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.lastSize = '';
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const width = Math.max(1, box.width), height = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.round(width * dpr), pixelH = Math.round(height * dpr);
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }
  render(game, camera, selection, elapsedMs) {
    const { ctx, width, height, dpr } = this;
    const layer = game.currentLayer;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = game.layer === UNDERGROUND ? '#241d19' : '#24382d';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 - camera.x * camera.zoom, height / 2 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    const bounds = {
      x0: clamp(Math.floor((camera.x - width / (2 * camera.zoom)) / TILE) - 1, 0, layer.width - 1),
      x1: clamp(Math.ceil((camera.x + width / (2 * camera.zoom)) / TILE) + 1, 0, layer.width - 1),
      y0: clamp(Math.floor((camera.y - height / (2 * camera.zoom)) / TILE) - 1, 0, layer.height - 1),
      y1: clamp(Math.ceil((camera.y + height / (2 * camera.zoom)) / TILE) + 1, 0, layer.height - 1)
    };
    for (let y = bounds.y0; y <= bounds.y1; y++) {
      for (let x = bounds.x0; x <= bounds.x1; x++) this.drawTile(ctx, game, layer, x, y);
    }
    if (camera.zoom > .85) {
      ctx.strokeStyle = game.layer === UNDERGROUND ? '#0d0c0b16' : '#050d0b12';
      ctx.lineWidth = .5;
      ctx.beginPath();
      for (let x = bounds.x0; x <= bounds.x1 + 1; x++) { ctx.moveTo(x * TILE, bounds.y0 * TILE); ctx.lineTo(x * TILE, (bounds.y1 + 1) * TILE); }
      for (let y = bounds.y0; y <= bounds.y1 + 1; y++) { ctx.moveTo(bounds.x0 * TILE, y * TILE); ctx.lineTo((bounds.x1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }
    for (const entrance of game.world.entrances) {
      const p = entrance[game.layer];
      if (p.x >= bounds.x0 && p.x <= bounds.x1 && p.y >= bounds.y0 && p.y <= bounds.y1) this.drawEntrance(ctx, p, game.layer, elapsedMs);
    }
    if (selection?.layer === game.layer && cellAt(layer, selection.x, selection.y) != null) {
      ctx.fillStyle = '#f3c67f24';
      ctx.strokeStyle = '#efc685';
      ctx.lineWidth = 1.7 / camera.zoom;
      ctx.fillRect(selection.x * TILE, selection.y * TILE, TILE, TILE);
      ctx.strokeRect(selection.x * TILE + 1, selection.y * TILE + 1, TILE - 2, TILE - 2);
    }
    ctx.restore();
    // Gentle vignette; renderer is independent of the fixed simulation clock.
    const g = ctx.createRadialGradient(width / 2, height * .43, Math.min(width, height) * .12, width / 2, height / 2, Math.max(width, height) * .77);
    g.addColorStop(0, '#060c0800');
    g.addColorStop(1, '#050c0b70');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  drawTile(ctx, game, layer, x, y) {
    const t = cellAt(layer, x, y);
    const px = x * TILE, py = y * TILE, seed = game.world.seed;
    const variation = tileHash(seed, x, y);
    ctx.fillStyle = colors[t];
    ctx.fillRect(px, py, TILE + .5, TILE + .5);
    if (t === TERRAINS.GRASS || t === TERRAINS.DIRT || t === TERRAINS.THICKET) {
      ctx.fillStyle = variation > .45 ? '#d0d6a014' : '#0c1f131e';
      ctx.fillRect(px, py, TILE, TILE);
      const count = t === TERRAINS.THICKET ? 5 : (t === TERRAINS.GRASS ? 3 : 1);
      for (let i = 0; i < count; i++) {
        const h = tileHash(seed, x, y, 37 + i * 97);
        const q = tileHash(seed, x, y, 86 + i * 53);
        const bx = px + 4 + h * 20, by = py + 5 + q * 20;
        ctx.strokeStyle = t === TERRAINS.DIRT ? '#c7a27843' : (i % 2 ? '#91a96b6b' : '#142e2266');
        ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(bx - 2, by + 3); ctx.lineTo(bx, by - 4 - h * 3); ctx.lineTo(bx + 2, by + 2); ctx.stroke();
      }
      if (t === TERRAINS.THICKET) {
        ctx.fillStyle = '#416a4588'; ctx.beginPath(); ctx.arc(px + 13, py + 14, 9 + variation * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#274e34'; ctx.beginPath(); ctx.arc(px + 18, py + 9, 6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (t === TERRAINS.WATER) {
      ctx.fillStyle = '#77b3ab26';
      ctx.beginPath(); ctx.ellipse(px + 12, py + 11, 9, 3, -.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9dbfba55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px + 17, py + 19, 5, .3, 2.5); ctx.stroke();
    } else if (t === TERRAINS.STONE) {
      ctx.fillStyle = '#949486'; ctx.beginPath(); ctx.ellipse(px + 15, py + 15, 10, 8, -.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#686d60'; ctx.beginPath(); ctx.ellipse(px + 16, py + 18, 8, 6, -.5, 0, Math.PI * 2); ctx.fill();
    } else {
      if (t === TERRAINS.ROCK) {
        ctx.fillStyle = '#74726924'; ctx.beginPath(); ctx.moveTo(px, py + 14); ctx.lineTo(px + 11, py); ctx.lineTo(px + TILE, py + 12); ctx.lineTo(px + 13, py + TILE); ctx.fill();
      } else if (t === TERRAINS.SOIL || t === TERRAINS.HARD_SOIL) {
        ctx.fillStyle = variation > .5 ? '#e1b98512' : '#08060019';
        ctx.beginPath(); ctx.arc(px + 5 + variation * 18, py + 5 + tileHash(seed, x, y, 7) * 18, 1.3 + variation * 1.7, 0, Math.PI * 2); ctx.fill();
        if (t === TERRAINS.HARD_SOIL) {
          ctx.strokeStyle = '#9b795022'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + 4, py + 20); ctx.lineTo(px + 14, py + 8); ctx.lineTo(px + 25, py + 14); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#fbd9a00c'; ctx.fillRect(px, py, TILE, TILE);
        if (t === TERRAINS.CHAMBER) {
          ctx.fillStyle = '#dfbc7a18'; ctx.beginPath(); ctx.ellipse(px + 14, py + 14, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Make cut edges readable, irrespective of zoom level.
        const carved = v => v === TERRAINS.TUNNEL || v === TERRAINS.CHAMBER || v === TERRAINS.ENTRANCE;
        ctx.strokeStyle = '#d2a06c88'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (!carved(cellAt(layer, x, y - 1))) { ctx.moveTo(px, py + 1); ctx.lineTo(px + TILE, py + 1); }
        if (!carved(cellAt(layer, x + 1, y))) { ctx.moveTo(px + TILE - 1, py); ctx.lineTo(px + TILE - 1, py + TILE); }
        if (!carved(cellAt(layer, x, y + 1))) { ctx.moveTo(px, py + TILE - 1); ctx.lineTo(px + TILE, py + TILE - 1); }
        if (!carved(cellAt(layer, x - 1, y))) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TILE); }
        ctx.stroke();
      }
    }
  }
  drawEntrance(ctx, p, layer, elapsedMs) {
    const x = (p.x + .5) * TILE, y = (p.y + .5) * TILE;
    const pulse = 1 + Math.sin(elapsedMs / 600) * .05;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#d6a76e1f'; ctx.beginPath(); ctx.arc(0, 0, 31 * pulse, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#f3cd8a99'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#171a15'; ctx.beginPath(); ctx.ellipse(0, 1, layer === SURFACE ? 11 : 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b77c'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 8px system-ui'; ctx.fillText('NEST 01', 0, -27);
    ctx.restore();
  }
}
