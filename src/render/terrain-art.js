/** MAP-ART-01 — seeded, camera-independent terrain paint. No gameplay writes.
 * Draws exclusively inside the tile; adjacent tiles are read for coherent seams.
 * Geometry is in world pixels, never screen/device pixels. */
import { TERRAINS, TILE, cellAt } from '../world/generate.js';
import { tileHash } from '../core/random.js';

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
