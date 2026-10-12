import { TILE } from '../world/generate.js';
export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 2.75;
export class Camera {
  constructor(layer, target) {
    this.layer = layer;
    this.x = (target.x + .5) * TILE;
    this.y = (target.y + .5) * TILE;
    this.zoom = 1;
  }
  worldToScreen(worldX, worldY, width, height) {
    return { x: (worldX - this.x) * this.zoom + width / 2, y: (worldY - this.y) * this.zoom + height / 2 };
  }
  screenToWorld(screenX, screenY, width, height) {
    return { x: (screenX - width / 2) / this.zoom + this.x, y: (screenY - height / 2) / this.zoom + this.y };
  }
  screenToCell(screenX, screenY, width, height) {
    const p = this.screenToWorld(screenX, screenY, width, height);
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  }
  pan(dx, dy, layer, width, height) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp(layer, width, height);
  }
  zoomAt(factor, sx, sy, layer, width, height) {
    const before = this.screenToWorld(sx, sy, width, height);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, width, height);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp(layer, width, height);
  }
  clamp(layer, width, height) {
    const maxX = layer.width * TILE, maxY = layer.height * TILE;
    const halfW = width / (2 * this.zoom), halfH = height / (2 * this.zoom);
    this.x = halfW * 2 >= maxX ? maxX / 2 : Math.max(halfW, Math.min(maxX - halfW, this.x));
    this.y = halfH * 2 >= maxY ? maxY / 2 : Math.max(halfH, Math.min(maxY - halfH, this.y));
  }
}
