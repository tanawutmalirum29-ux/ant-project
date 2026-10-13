import { TERRAINS, SURFACE, UNDERGROUND, TILE, cellAt } from '../world/generate.js';
import { tileHash } from '../core/random.js';
import { ROOM_CATALOG, ROOM_LIMITS } from '../core/rooms.js';
import { isWalkable } from '../world/navigation.js';
import { displayedPosition } from '../core/game.js';

/** MAP-ART-01 — seeded, camera-independent terrain paint. No gameplay writes.
 * Draws exclusively inside the tile; adjacent tiles are read for coherent seams.
 * Geometry is in world pixels, never screen/device pixels. */

const TAU = Math.PI * 2;
const OPEN = new Set([TERRAINS.TUNNEL, TERRAINS.CHAMBER, TERRAINS.ENTRANCE]);
const palette = {
  [TERRAINS.GRASS]: '#3c6143', [TERRAINS.DIRT]: '#796044',
  [TERRAINS.THICKET]: '#234634', [TERRAINS.WATER]: '#285c68',
  [TERRAINS.STONE]: '#556255', [TERRAINS.SOIL]: '#63482f',
  [TERRAINS.HARD_SOIL]: '#49372b', [TERRAINS.ROCK]: '#303a3b',
  [TERRAINS.TUNNEL]: '#a37e55', [TERRAINS.CHAMBER]: '#b38b5f',
  [TERRAINS.ENTRANCE]: '#a98157'
};

function path(ctx, points, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(ox + points[0], oy + points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(ox + points[i], oy + points[i + 1]);
}
function ellipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, TAU); ctx.fill();
}
function h(seed, x, y, salt) { return tileHash(seed, x, y, salt); }
function stroke(ctx, color, width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
function neighbor(layer, x, y, dx, dy) { return cellAt(layer, x + dx, y + dy); }
function differentSolid(t) { return t === TERRAINS.SOIL || t === TERRAINS.HARD_SOIL || t === TERRAINS.ROCK; }

/** Render one visible cell. Details are suppressed at small zoom, not randomized per frame.
 * Unknown terrain types use a clear fallback instead of pretending to be a tunnel.
 */
export function paintTerrainTile(ctx, layer, seed, x, y, zoom = 1) {
  const t = cellAt(layer, x, y);
  if (t == null) return;
  const px = x * TILE, py = y * TILE;
  const v = h(seed, x, y, 19);
  const fine = zoom >= .7;
  const base = palette[t] ?? '#b14669';
  ctx.fillStyle = base;
  ctx.fillRect(px, py, TILE + .5, TILE + .5);
  // Wide facets retain visual identity at low zoom. No scattered random pixels.
  if (t === TERRAINS.GRASS || t === TERRAINS.DIRT || t === TERRAINS.THICKET) {
    const green = t !== TERRAINS.DIRT;
    ctx.fillStyle = green ? (v > .52 ? '#92b47618' : '#132d252c') : (v > .5 ? '#d6b9861b' : '#412f262b');
    ellipse(ctx, px + 9 + v * 10, py + 14, 11, 9, v * .5);
    if (t === TERRAINS.THICKET) {
      // A cluster of layered leaf masses; the understory remains separate from grass.
      ctx.fillStyle = '#152f2b'; ellipse(ctx, px + 15, py + 18, 12, 8, -.2);
      ctx.fillStyle = '#345e40'; ellipse(ctx, px + 10, py + 12, 10, 9, -.5);
      ctx.fillStyle = '#47784c'; ellipse(ctx, px + 19, py + 11, 8, 7, .5);
      if (fine) {
        ctx.strokeStyle = '#9bbf785c'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const bx = px + 8 + h(seed, x, y, 131 + i) * 13;
          const by = py + 7 + h(seed, x, y, 142 + i) * 10;
          path(ctx, [0, 3, 1, -1, 5, -3], bx, by); ctx.stroke();
        }
      }
    } else if (fine) {
      const count = t === TERRAINS.GRASS ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const bx = px + 4 + h(seed, x, y, 210 + i * 17) * 19;
        const by = py + 7 + h(seed, x, y, 240 + i * 13) * 16;
        if (green) {
          path(ctx, [-3, 2, 0, -5, 1, 2, 4, -2], bx, by);
          stroke(ctx, i % 2 ? '#a7c27f98' : '#26412f', 1.2);
        } else {
          path(ctx, [-5, 1, 1, -1, 5, 0], bx, by);
          stroke(ctx, i % 2 ? '#c69f6f6e' : '#3f33266b', 1.1);
          ctx.fillStyle = '#ccb08776'; ellipse(ctx, bx + 2, by + 3, 1.5, .9);
        }
      }
    }
    // Clusters receive a subtle soil transition along neighboring water.
    if (neighbor(layer, x, y, 0, -1) === TERRAINS.WATER) {
      ctx.fillStyle = '#9ca77e55'; ctx.fillRect(px, py, TILE, 3);
    }
    return;
  }
  if (t === TERRAINS.WATER) {
    const shore = [neighbor(layer,x,y,0,-1), neighbor(layer,x,y,1,0),
      neighbor(layer,x,y,0,1), neighbor(layer,x,y,-1,0)];
    ctx.fillStyle = '#19455255'; ctx.fillRect(px + 2, py + 3, TILE - 4, TILE - 6);
    // Shallow turquoise edges connect into dry land without modifying terrain codes.
    ctx.fillStyle = '#6ab0a377';
    if (shore[0] != null && shore[0] !== t) ctx.fillRect(px, py, TILE, 3);
    if (shore[1] != null && shore[1] !== t) ctx.fillRect(px + TILE - 3, py, 3, TILE);
    if (shore[2] != null && shore[2] !== t) ctx.fillRect(px, py + TILE - 3, TILE, 3);
    if (shore[3] != null && shore[3] !== t) ctx.fillRect(px, py, 3, TILE);
    ctx.strokeStyle = '#a3d9ce85'; ctx.lineWidth = 1.2;
    const ry = py + 10 + v * 11;
    ctx.beginPath(); ctx.ellipse(px + 13, ry, 9, 3, -.15, .2, 2.8); ctx.stroke();
    if (fine) {
      ctx.strokeStyle = '#d4ebe07c'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(px + 18, py + 19, 4, 1.8, .15, 3.4, 5.8); ctx.stroke();
    }
    return;
  }
  if (t === TERRAINS.STONE) {
    ctx.fillStyle = '#1c2a2988'; ellipse(ctx, px + 15, py + 21, 12, 6, -.2);
    ctx.fillStyle = '#7d8b79';
    path(ctx, [4, 19, 7, 9, 16, 5, 24, 12, 25, 20, 18, 25, 9, 24], px, py); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a0a891';
    path(ctx, [7, 9, 16, 5, 24, 12, 17, 14, 11, 17], px, py); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a5a55';
    path(ctx, [17, 14, 24, 12, 25, 20, 18, 25, 16, 20], px, py); ctx.closePath(); ctx.fill();
    if (fine) {
      path(ctx, [10, 12, 14, 14, 13, 19], px, py); stroke(ctx, '#354542aa', 1);
    }
    return;
  }
  if (t === TERRAINS.SOIL || t === TERRAINS.HARD_SOIL) {
    const hard = t === TERRAINS.HARD_SOIL;
    const band = ((y * 7 + Math.floor(v * 5)) % 13);
    ctx.fillStyle = hard ? '#241f1a39' : '#e0b77718';
    ctx.fillRect(px, py + band, TILE + .5, hard ? 6 : 4);
    ctx.strokeStyle = hard ? '#b2936e69' : '#b88e5d50';
    ctx.lineWidth = hard ? 1.7 : 1;
    ctx.beginPath(); ctx.moveTo(px + 2, py + 9 + v * 5);
    ctx.lineTo(px + 13, py + 8 + v * 5); ctx.lineTo(px + 26, py + 12 + v * 5); ctx.stroke();
    if (hard) {
      // Tight, directional compression bands communicate slow digging.
      ctx.strokeStyle = '#d0b08072'; ctx.lineWidth = 1.4;
      path(ctx, [3, 24, 9, 17, 14, 19, 24, 7], px, py); ctx.stroke();
      ctx.fillStyle = '#1b201c36'; ellipse(ctx, px + 19, py + 23, 7, 3, -.35);
    } else if (fine) {
      ctx.fillStyle = '#c6a16d69';
      ellipse(ctx, px + 5 + v * 16, py + 22, 1.8, 1);
      path(ctx, [5, 7, 8, 5, 12, 7], px, py); stroke(ctx, '#261e164d', .9);
    }
    return;
  }
  if (t === TERRAINS.ROCK) {
    // Continuous horizontal geological bedding: phase uses world y, not random local y.
    const bandY = (Math.floor(y / 3) % 2) * 3;
    ctx.fillStyle = v > .52 ? '#77827a1a' : '#111c2055';
    path(ctx, [0, 5 + bandY, 11, 1 + bandY, 28, 7 + bandY, 28, 18 + bandY, 17, 14 + bandY, 0, 21 + bandY], px, py);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#92a19a6b'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px, py + 7 + bandY);
    ctx.lineTo(px + 10, py + 6 + bandY); ctx.lineTo(px + 18, py + 9 + bandY);
    ctx.lineTo(px + TILE, py + 7 + bandY); ctx.stroke();
    ctx.strokeStyle = '#0d191c88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py + 21); ctx.lineTo(px + 13, py + 19);
    ctx.lineTo(px + TILE, py + 22); ctx.stroke();
    if (fine && v > .28) {
      path(ctx, [7, 2, 12, 11, 9, 16, 17, 23], px, py);
      stroke(ctx, '#b0b8a055', 1.1);
    }
    // Bright fractured faces against dug-out space, dark counter-shadow within stone.
    const faces = [OPEN.has(neighbor(layer,x,y,0,-1)), OPEN.has(neighbor(layer,x,y,1,0)),
      OPEN.has(neighbor(layer,x,y,0,1)), OPEN.has(neighbor(layer,x,y,-1,0))];
    ctx.fillStyle = '#101817bf';
    if (faces[0]) ctx.fillRect(px, py, TILE, 5);
    if (faces[1]) ctx.fillRect(px + TILE - 5, py, 5, TILE);
    if (faces[2]) ctx.fillRect(px, py + TILE - 5, TILE, 5);
    if (faces[3]) ctx.fillRect(px, py, 5, TILE);
    ctx.strokeStyle = '#a5b1a18c'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (faces[0]) {ctx.moveTo(px + 1, py + 2); ctx.lineTo(px + TILE - 1, py + 2);}
    if (faces[1]) {ctx.moveTo(px + TILE - 2, py + 1); ctx.lineTo(px + TILE - 2, py + TILE - 1);}
    if (faces[2]) {ctx.moveTo(px + 1, py + TILE - 2); ctx.lineTo(px + TILE - 1, py + TILE - 2);}
    if (faces[3]) {ctx.moveTo(px + 2, py + 1); ctx.lineTo(px + 2, py + TILE - 1);}
    ctx.stroke();
    return;
  }
  if (OPEN.has(t)) {
    const chamber = t === TERRAINS.CHAMBER;
    ctx.fillStyle = chamber ? '#debb8250' : '#f0c38819';
    ellipse(ctx, px + 14, py + 15, 11 + v * 2, 8, v * .4);
    if (fine) {
      ctx.strokeStyle = chamber ? '#f2d5a13c' : '#ebc09136'; ctx.lineWidth = .9;
      path(ctx, [4, 21, 9, 20, 13, 22], px, py); ctx.stroke();
      ctx.fillStyle = '#62492d52'; ellipse(ctx, px + 21, py + 7 + v * 6, 1.8, .9);
    }
    // Only boundaries facing unexcavated matter; room furnishings draw after this.
    const sides = [neighbor(layer,x,y,0,-1), neighbor(layer,x,y,1,0),
      neighbor(layer,x,y,0,1), neighbor(layer,x,y,-1,0)];
    ctx.strokeStyle = '#473322b8'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (!OPEN.has(sides[0])) {ctx.moveTo(px,py + 2);ctx.lineTo(px + TILE,py + 2);}
    if (!OPEN.has(sides[1])) {ctx.moveTo(px + TILE - 2,py);ctx.lineTo(px + TILE - 2,py + TILE);}
    if (!OPEN.has(sides[2])) {ctx.moveTo(px,py + TILE - 2);ctx.lineTo(px + TILE,py + TILE - 2);}
    if (!OPEN.has(sides[3])) {ctx.moveTo(px + 2,py);ctx.lineTo(px + 2,py + TILE);}
    ctx.stroke();
    ctx.strokeStyle = '#e5b780b0'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (!OPEN.has(sides[0])) {ctx.moveTo(px,py + 4);ctx.lineTo(px + TILE,py + 4);}
    if (!OPEN.has(sides[1])) {ctx.moveTo(px + TILE - 4,py);ctx.lineTo(px + TILE - 4,py + TILE);}
    if (!OPEN.has(sides[2])) {ctx.moveTo(px,py + TILE - 4);ctx.lineTo(px + TILE,py + TILE - 4);}
    if (!OPEN.has(sides[3])) {ctx.moveTo(px + 4,py);ctx.lineTo(px + 4,py + TILE);}
    ctx.stroke();
    return;
  }
  // Unknown terrain is an unmistakable debug magenta tile, never an implicit room.
  ctx.strokeStyle = '#ffe2ea'; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
}

export const terrainArtPalette = Object.freeze({ ...palette });
export const terrainArtIsSolid = differentSolid;


const RALLY_PING_MS = 1500;
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
    this.rallyPing = null;
  }
  showRallyPing(game, layer, x, y, startedAt = performance.now()) {
    this.rallyPing = { game, layer, x, y, startedAt };
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
  render(game, camera, selection, elapsedMs, digPreview = null, roomPreview = null, roomType = null) {
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
      for (let x = bounds.x0; x <= bounds.x1; x++) this.drawTile(ctx, game, layer, x, y, camera.zoom);
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
    if (game.layer === UNDERGROUND) {
      this.drawRooms(ctx,game,bounds,camera);
      this.drawOrders(ctx, game, bounds, camera);
      if (digPreview) this.drawDigPreview(ctx, game, digPreview, bounds, camera);
      if(roomPreview&&roomType)this.drawRoomPreview(ctx,game,roomPreview,roomType,camera);
    } else this.drawResources(ctx, game, bounds, elapsedMs);
    if(game.layer===UNDERGROUND && game.lifecycle) this.drawBrood(ctx, game);
    this.drawAnts(ctx, game, elapsedMs, camera);
    this.drawCombat(ctx, game, elapsedMs);
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
  /** Individually rendered, deterministic room furniture rather than a flat
   * color block. All paths live on the canvas; no image downloads or animation
   * randomness, so equal worlds and zoom levels produce identical artwork. */
  drawRoomMotif(ctx,type,x,y,variation,seed) {
    const cx=x+TILE/2,cy=y+TILE/2;
    ctx.save();
    if(type==='nursery') {
      // Woven cradle holding pale brood with a warmer shell.
      ctx.fillStyle='#5b4031';ctx.beginPath();ctx.ellipse(cx,cy+3,11,8,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d2a16c';ctx.lineWidth=2;
      for(const dy of [-2,2,5]){ctx.beginPath();ctx.ellipse(cx,cy+dy,10,4,0,0,Math.PI);ctx.stroke();}
      ctx.fillStyle='#f6e7c8';ctx.strokeStyle='#e6b2b1';ctx.lineWidth=.8;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx-6+i*6,cy+variation*3-1,2.8,4.4,.3,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }else if(type==='food_store') {
      // Granary crates of grain, seeds and protein sacks.
      ctx.fillStyle='#69462b';ctx.fillRect(x+4,y+8,20,15);
      ctx.strokeStyle='#d8a76c';ctx.lineWidth=1.8;ctx.strokeRect(x+4,y+8,20,15);
      ctx.beginPath();ctx.moveTo(x+4,y+15);ctx.lineTo(x+24,y+15);ctx.moveTo(x+14,y+8);ctx.lineTo(x+14,y+23);ctx.stroke();
      for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#eed09a':'#c89b4e';ctx.beginPath();ctx.ellipse(x+7+i*4.5,y+7+(i%2)*2,2.3,3,variation,0,Math.PI*2);ctx.fill();}
    }else if(type==='water_store') {
      // Deep blue stone-lined cistern, central water and reflected wave arcs.
      ctx.fillStyle='#496879';ctx.beginPath();ctx.ellipse(cx,cy+2,11.5,10.5,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c5c4a2';ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle='#4b9aa9';ctx.beginPath();ctx.ellipse(cx,cy+3,9,8,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#b9eaf0';ctx.lineWidth=1.2;
      for(const t of [-1,5]){ctx.beginPath();ctx.moveTo(cx-6,cy+t);ctx.quadraticCurveTo(cx-2,cy+t-3,cx+1,cy+t);ctx.quadraticCurveTo(cx+4,cy+t+2,cx+7,cy+t-1);ctx.stroke();}
    }else if(type==='rest') {
      // Leaf mattress and tiny grass-woven headrest.
      ctx.fillStyle='#72543e';ctx.beginPath();ctx.ellipse(cx,cy+3,11,8,-.25,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#7eaa75';ctx.beginPath();ctx.ellipse(cx-1,cy+1,10,6,-.35,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c2d69a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-10,cy+5);ctx.lineTo(cx+8,cy-2);ctx.stroke();
      ctx.fillStyle='#d5d5a6';ctx.beginPath();ctx.ellipse(cx-6,cy-1,4,3,-.3,0,Math.PI*2);ctx.fill();
    }else if(type==='guard') {
      // Defensive barricade, spear rack and buckler.
      ctx.fillStyle='#6c4a35';ctx.fillRect(x+4,y+17,20,6);
      ctx.strokeStyle='#d7ae7d';ctx.lineWidth=1.7;
      for(const sx of [8,13,18,23]){ctx.beginPath();ctx.moveTo(x+sx,y+22);ctx.lineTo(x+sx-2,y+6);ctx.stroke();}
      ctx.fillStyle='#d9a98a';ctx.beginPath();ctx.moveTo(cx-5,y+6);ctx.lineTo(cx-2,y+1);ctx.lineTo(cx+1,y+6);ctx.fill();
      ctx.fillStyle='#9f7058';ctx.beginPath();ctx.moveTo(cx+4,cy-2);ctx.lineTo(cx+11,cy);ctx.lineTo(cx+9,cy+7);ctx.lineTo(cx+4,cy+9);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#e3c8a0';ctx.lineWidth=1;ctx.stroke();
    }else if(type==='queen'){
      // Decorative central throne, patterned royal chamber floor.
      ctx.fillStyle='#7c503f';ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#f4d79b';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#e5b66a';ctx.beginPath();ctx.moveTo(cx-7,cy+3);ctx.lineTo(cx-6,cy-5);ctx.lineTo(cx-2,cy-2);ctx.lineTo(cx,cy-8);ctx.lineTo(cx+3,cy-2);ctx.lineTo(cx+7,cy-5);ctx.lineTo(cx+6,cy+3);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
  drawRooms(ctx,game,bounds,camera) {
    if(!game.rooms)return;
    const palette={
      queen:{floor:'#71563d',light:'#f4d49e',edge:'#e8c37b'},
      nursery:{floor:'#765b60',light:'#deb9c5',edge:'#efc5d1'},
      food_store:{floor:'#776141',light:'#efcf83',edge:'#dcb96d'},
      water_store:{floor:'#416775',light:'#a6e4e8',edge:'#85cbd6'},
      rest:{floor:'#4f6a4f',light:'#bdd39e',edge:'#a4c28b'},
      guard:{floor:'#6e4e46',light:'#d9a08d',edge:'#e3ac8c'}
    };
    for(const room of game.rooms.rooms) {
      if(room.x+room.width<=bounds.x0||room.x>bounds.x1||room.y+room.height<=bounds.y0||room.y>bounds.y1)continue;
      const style=palette[room.type],left=room.x*TILE,top=room.y*TILE;
      const w=room.width*TILE,h=room.height*TILE;
      const ready=room.status==='ready',active=room.status!=='disabled';
      ctx.save();
      ctx.globalAlpha=active?1:.34;
      for(let yy=room.y;yy<room.y+room.height;yy++)for(let xx=room.x;xx<room.x+room.width;xx++){
        if(xx<bounds.x0||xx>bounds.x1||yy<bounds.y0||yy>bounds.y1)continue;
        const px=xx*TILE,py=yy*TILE,v=tileHash(game.world.seed,xx,yy,17);
        ctx.fillStyle=style.floor;ctx.fillRect(px,py,TILE+.5,TILE+.5);
        ctx.fillStyle=v>.55?'#f6e1b010':'#070d0d12';ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
        ctx.strokeStyle='#ffefd215';ctx.lineWidth=.65;ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);
        if(ready){
          this.drawRoomMotif(ctx,room.type,px,py,v,game.world.seed);
        }else{
          ctx.strokeStyle=style.light;ctx.globalAlpha=active?.55:.2;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(px+6,py+6);ctx.lineTo(px+22,py+22);ctx.moveTo(px+22,py+6);ctx.lineTo(px+6,py+22);ctx.stroke();
          ctx.globalAlpha=active?1:.34;
        }
      }
      // The thick, unified perimeter marks a *single* room, no 2×2 seams.
      ctx.strokeStyle='#221f19';ctx.lineWidth=5;
      ctx.strokeRect(left+2,top+2,w-4,h-4);
      ctx.strokeStyle=style.edge;ctx.lineWidth=2.2;
      ctx.setLineDash(ready?[]:[5,4]);
      ctx.strokeRect(left+2,top+2,w-4,h-4);ctx.setLineDash([]);
      // Corners, subtle structural reinforcement.
      ctx.strokeStyle=style.light;ctx.lineWidth=2.3;
      for(const [xx,yy,sx,sy] of [[left+3,top+3,1,1],[left+w-3,top+3,-1,1],[left+3,top+h-3,1,-1],[left+w-3,top+h-3,-1,-1]]){
        ctx.beginPath();ctx.moveTo(xx+sx*7,yy);ctx.lineTo(xx,yy);ctx.lineTo(xx,yy+sy*7);ctx.stroke();
      }
      if(!ready){
        ctx.fillStyle='#0e1717b9';ctx.fillRect(left+5,top+h-11,w-10,7);
        const percent=room.progress/Math.max(1,room.ticks??ROOM_CATALOG[room.type].ticks);
        ctx.fillStyle=style.light;ctx.fillRect(left+5,top+h-11,(w-10)*Math.min(1,percent),7);
      }else if(room.stock&&room.width*TILE>=50){
        const stored=Object.values(room.stock).reduce((a,b)=>a+b,0);
        if(stored>0){ctx.fillStyle='#121d1bbd';ctx.fillRect(left+w/2-17,top+h-16,34,13);
          ctx.fillStyle='#f6e8bd';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(String(stored),left+w/2,top+h-10);}
      }
      ctx.restore();
    }
  }
  drawRoomPreview(ctx,game,preview,type,camera) {
    const def=ROOM_CATALOG[type];if(!def||!preview?.from)return;
    const from=preview.from,to=preview.dragging?preview.to:preview.from;
    const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y);
    const width=preview.dragging?Math.abs(from.x-to.x)+1:def.width;
    const height=preview.dragging?Math.abs(from.y-to.y)+1:def.height;
    const status=game.rooms.validate(type,x,y,width,height);
    const bx=x*TILE,by=y*TILE,w=width*TILE,h=height*TILE;
    const border=status.ok?'#a7ffca':'#ff9c8f';
    ctx.save();ctx.lineWidth=1/Math.max(camera.zoom,.6);
    const layer=game.world.layers[UNDERGROUND];
    for(let yy=y;yy<y+Math.min(height,ROOM_LIMITS.maxHeight+1);yy++)
      for(let xx=x;xx<x+Math.min(width,ROOM_LIMITS.maxWidth+1);xx++){
        const local=isWalkable(layer,xx,yy)&&!game.rooms.getRoom(xx,yy)&&
          !game.world.entrances.some(e=>e.underground.x===xx&&e.underground.y===yy);
        ctx.fillStyle=local?(status.ok?'#64dca366':'#d6b76841'):'#ee605c88';
        ctx.fillRect(xx*TILE+1,yy*TILE+1,TILE-2,TILE-2);
        ctx.strokeStyle=local?'#bce4b788':'#ffaba2';
        ctx.strokeRect(xx*TILE+2,yy*TILE+2,TILE-4,TILE-4);
      }
    ctx.lineWidth=3/Math.max(camera.zoom,.65);
    ctx.strokeStyle=border;ctx.setLineDash([7,4]);ctx.strokeRect(bx+1,by+1,w-2,h-2);ctx.setLineDash([]);
    ctx.fillStyle='#152622eb';ctx.strokeStyle=border;ctx.lineWidth=1;
    const label=`${width}×${height} · ${width*height} ช่อง`,labelW=Math.max(77,label.length*7+15);
    const labelY=by-12;
    ctx.fillRect(bx+w/2-labelW/2,labelY-11,labelW,22);
    ctx.strokeRect(bx+w/2-labelW/2,labelY-11,labelW,22);
    ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fcf1d5';
    ctx.fillText(label,bx+w/2,labelY);
    ctx.restore();
  }
  drawOrders(ctx,game,bounds,camera) {
    for(const job of game.colony.orders.values()) {
      if(job.x<bounds.x0||job.x>bounds.x1||job.y<bounds.y0||job.y>bounds.y1) continue;
      const x=job.x*TILE,y=job.y*TILE;
      ctx.fillStyle=job.status==='digging'?'#e7a75a88':job.status==='assigned'?'#e0b17a5a':'#d2bd7740';
      ctx.fillRect(x+2,y+2,TILE-4,TILE-4);
      ctx.lineWidth=1/Math.max(camera.zoom,.5);
      ctx.strokeStyle='#e4b973aa';ctx.strokeRect(x+2,y+2,TILE-4,TILE-4);
      if(job.progress){
        const total=job.terrain===TERRAINS.HARD_SOIL?30:12;
        ctx.fillStyle='#30291e';ctx.fillRect(x+3,y+TILE-7,TILE-6,4);
        ctx.fillStyle='#ffdf92';ctx.fillRect(x+3,y+TILE-7,(TILE-6)*Math.min(1,job.progress/total),4);
      }
    }
  }
  drawDigPreview(ctx,game,preview,bounds,camera) {
    const l=game.currentLayer;
    const x0=Math.max(bounds.x0,Math.min(preview.from.x,preview.to.x));
    const x1=Math.min(bounds.x1,Math.max(preview.from.x,preview.to.x));
    const y0=Math.max(bounds.y0,Math.min(preview.from.y,preview.to.y));
    const y1=Math.min(bounds.y1,Math.max(preview.from.y,preview.to.y));
    ctx.lineWidth=1/Math.max(camera.zoom,.5);
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
      const t=cellAt(l,x,y),valid=t===TERRAINS.SOIL||t===TERRAINS.HARD_SOIL;
      ctx.fillStyle=valid?'#a9df8277':'#ee777433';
      ctx.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
      ctx.strokeStyle=valid?'#bfe998':'#eb989866';
      ctx.strokeRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
    }
  }
  drawResources(ctx,game,bounds,elapsedMs) {
    for(const node of game.foraging.nodes) {
      if(node.amount<=0 || node.x<bounds.x0 || node.x>bounds.x1 || node.y<bounds.y0 || node.y>bounds.y1)continue;
      const x=(node.x+.5)*TILE,y=(node.y+.5)*TILE;
      const colors={carbs:'#e8c06b',protein:'#d98367',water:'#82c9d8'};
      ctx.save();ctx.translate(x,y);
      ctx.fillStyle='#111c17c9';ctx.beginPath();ctx.arc(0,1,10,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=1.8;ctx.strokeStyle=colors[node.type];ctx.stroke();
      ctx.fillStyle=colors[node.type];
      if(node.type==='water') {ctx.beginPath();ctx.moveTo(0,-8);ctx.quadraticCurveTo(12,4,0,8);ctx.quadraticCurveTo(-12,4,0,-8);ctx.fill();}
      else if(node.type==='protein') {ctx.beginPath();ctx.ellipse(0,0,6,3,-.45,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d7bca2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-7,6);ctx.stroke();}
      else {ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0be';ctx.fillRect(-2,-3,2,2);}
      ctx.restore();
    }
  }
  drawBrood(ctx,game) {
    const babies=game.lifecycle.brood;
    const q=game.colony.queen;
    for(let i=0;i<babies.length;i++) {
      const b=babies[i],angle=i*2.39996,r=2+(i%5)*2;
      const x=((b.x??q.x)+.5)*TILE+Math.cos(angle)*r;
      const y=((b.y??q.y)+.5)*TILE+Math.sin(angle)*r;
      if(b.site==='temporary'&&!b.carrierId){
        ctx.fillStyle='#59493288';
        ctx.beginPath();ctx.ellipse(x,y+2,9,6,0,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=b.stage==='egg'?'#fff1c9':b.stage==='larva'?'#e5c58e':'#aa724b';
      ctx.strokeStyle='#5c3825';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(x,y,b.stage==='pupa'?5:3.5,b.stage==='larva'?6:4.5,angle,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
  }
  drawAnts(ctx,game,elapsedMs,camera) {
    const c=game.colony;
    if (c.queen.alive && c.queen.layer===game.layer) this.drawAnt(ctx,game,c.queen,true,elapsedMs);
    for(const ant of c.workers) if(ant.layer===game.layer) this.drawAnt(ctx,game,ant,false,elapsedMs);
  }
  drawAnt(ctx,game,ant,queen,elapsedMs) {
    const pose=displayedPosition(game,ant);
    const x=(pose.x+.5)*TILE;
    const y=(pose.y+.5)*TILE;
    const dir=ant.facing||0;
    const angle=[-Math.PI/2,0,Math.PI/2,Math.PI][dir];
    const scale=queen?1.42:.82;
    const wobble=(ant.next||(ant.state==='walking'||ant.state==='nursing'||ant.state?.startsWith('forage-')))?Math.sin(elapsedMs/85)*.5:0;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);ctx.scale(scale,scale);
    ctx.fillStyle='#0c0b09aa';ctx.beginPath();ctx.ellipse(1,3,7,11,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=queen?'#402311':'#2b1b12';ctx.lineWidth=2;ctx.lineCap='round';
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      const py=-5+i*5;
      ctx.beginPath();ctx.moveTo(side*2,py);
      ctx.lineTo(side*(7+(i===1?3:0)),py+wobble*(i%2?1:-1));
      ctx.lineTo(side*10,py+4+wobble);ctx.stroke();
    }
    ctx.fillStyle=queen?'#854d2f':'#8b512b';ctx.beginPath();ctx.ellipse(0,6,5.2,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=queen?'#bf8450':'#b0753f';ctx.beginPath();ctx.ellipse(0,-2,3.7,4.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=queen?'#d5a16b':'#cf9657';ctx.beginPath();ctx.ellipse(0,-9,4.5,4,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#dfb57d';ctx.lineWidth=.8;
    for(const side of [-1,1]) {ctx.beginPath();ctx.moveTo(side*2,-11);ctx.quadraticCurveTo(side*5,-17,side*8,-15);ctx.stroke();}
    if(ant.cargo?.amount){
      ctx.fillStyle={carbs:'#f0d486',protein:'#e98e70',water:'#86daeb'}[ant.cargo.type];
      ctx.strokeStyle='#302920';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.arc(0,-16,3.5+ant.cargo.amount*.4,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    if(queen){ctx.fillStyle='#f1d69c';ctx.beginPath();ctx.moveTo(-7,-16);ctx.lineTo(-4,-22);ctx.lineTo(0,-18);ctx.lineTo(4,-22);ctx.lineTo(7,-16);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  drawCombat(ctx,game,elapsedMs) {
    const combat=game.combat;
    if(!combat)return;
    ctx.save();
    for(const ant of combat.soldiers) {
      if(ant.layer!==game.layer)continue;
      const pose=displayedPosition(game,ant);
      const x=(pose.x+.5)*TILE;
      const y=(pose.y+.5)*TILE;
      ctx.strokeStyle=ant.retreating?'#eaa58b':'#a9dce0';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#202322';ctx.fillRect(x-10,y-18,20,3);
      ctx.fillStyle='#b1dbac';ctx.fillRect(x-10,y-18,20*Math.max(0,(ant.combatHP||0)/16),3);
    }
    for(const enemy of combat.enemies) {
      if(enemy.layer!==game.layer)continue;
      const pose=displayedPosition(game,enemy);
      const x=(pose.x+.5)*TILE;
      const y=(pose.y+.5)*TILE;
      ctx.fillStyle=enemy.type==='beetle'?'#7c3450':'#7b2f2d';
      ctx.strokeStyle='#f0b8a1';ctx.lineWidth=1.8;
      ctx.beginPath();ctx.ellipse(x,y,enemy.type==='beetle'?12:9,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-7,y-5);ctx.lineTo(x-13,y-10);ctx.moveTo(x+7,y-5);ctx.lineTo(x+13,y-10);ctx.stroke();
      ctx.fillStyle='#fbdfbd';ctx.beginPath();ctx.arc(x-4,y-2,1.8,0,Math.PI*2);ctx.arc(x+4,y-2,1.8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#2a1716';ctx.fillRect(x-10,y-18,20,3);
      ctx.fillStyle='#e68d79';ctx.fillRect(x-10,y-18,20*enemy.hp/enemy.maxHP,3);
    }
    const ping=this.rallyPing;
    if(ping && (ping.game!==game || elapsedMs-ping.startedAt>=RALLY_PING_MS)) this.rallyPing=null;
    else if(ping && ping.layer===game.layer && elapsedMs>=ping.startedAt){
      const age=elapsedMs-ping.startedAt, progress=age/RALLY_PING_MS;
      const x=(ping.x+.5)*TILE,y=(ping.y+.5)*TILE;
      ctx.save();
      ctx.globalAlpha=Math.min(1,(RALLY_PING_MS-age)/450);
      ctx.strokeStyle='#ffe29a';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,11+progress*12,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  drawTile(ctx, game, layer, x, y, zoom = 1) {
    paintTerrainTile(ctx, layer, game.world.seed, x, y, zoom);
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
