import { createRandom, normalizeSeed } from '../core/random.js';
export const SURFACE = 'surface';
export const UNDERGROUND = 'underground';
export const TILE = 28;
export const TERRAINS = Object.freeze({
  GRASS: 0, DIRT: 1, THICKET: 2, WATER: 3, STONE: 4,
  SOIL: 10, HARD_SOIL: 11, ROCK: 12, TUNNEL: 13, CHAMBER: 14, ENTRANCE: 15
});
const sizes = { [SURFACE]: [128, 128], [UNDERGROUND]: [96, 64] };
function makeLayer(kind) {
  const [width, height] = sizes[kind];
  return { kind, width, height, cells: new Uint8Array(width * height) };
}
export function cellAt(layer, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= layer.width || y >= layer.height) return null;
  return layer.cells[y * layer.width + x];
}
export function writeCell(layer, x, y, terrain) {
  if (x >= 0 && y >= 0 && x < layer.width && y < layer.height) layer.cells[y * layer.width + x] = terrain;
}
function disc(layer, cx, cy, rx, ry, terrain) {
  for (let y = Math.max(0, cy - ry); y <= Math.min(layer.height - 1, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x <= Math.min(layer.width - 1, cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) writeCell(layer, x, y, terrain);
    }
  }
}
function tunnel(layer, x1, y1, x2, y2) {
  let x = x1, y = y1;
  while (x !== x2 || y !== y2) {
    disc(layer, x, y, 1, 1, TERRAINS.TUNNEL);
    if (y !== y2 && (x === x2 || Math.abs(y2 - y) > Math.abs(x2 - x))) y += Math.sign(y2 - y);
    else x += Math.sign(x2 - x);
  }
  disc(layer, x, y, 1, 1, TERRAINS.TUNNEL);
}
function surface(seed, entrance) {
  const layer = makeLayer(SURFACE);
  const rng = createRandom(seed ^ 0xa81c7e);
  layer.cells.fill(TERRAINS.GRASS);
  for (let i = 0; i < 55; i++) {
    const x = rng.int(4, 123), y = rng.int(4, 123);
    disc(layer, x, y, rng.int(2, 5), rng.int(1, 3), rng.next() < .7 ? TERRAINS.DIRT : TERRAINS.THICKET);
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.int(8, 119), y = rng.int(8, 119);
    disc(layer, x, y, rng.int(2, 4), rng.int(2, 3), TERRAINS.WATER);
  }
  for (let i = 0; i < 95; i++) {
    const x = rng.int(1, 126), y = rng.int(1, 126);
    if (cellAt(layer, x, y) === TERRAINS.GRASS) writeCell(layer, x, y, TERRAINS.STONE);
  }
  // Guarantee a safe clearing with the shared entry at the colony origin.
  disc(layer, entrance.surface.x, entrance.surface.y, 6, 5, TERRAINS.DIRT);
  writeCell(layer, entrance.surface.x, entrance.surface.y, TERRAINS.ENTRANCE);
  return layer;
}
function underground(seed, entrance) {
  const layer = makeLayer(UNDERGROUND);
  const rng = createRandom(seed ^ 0x15c0ffee);
  layer.cells.fill(TERRAINS.SOIL);
  for (let i = 0; i < 85; i++) {
    const x = rng.int(4, 91), y = rng.int(5, 59);
    disc(layer, x, y, rng.int(1, 4), rng.int(1, 3), rng.next() < .72 ? TERRAINS.HARD_SOIL : TERRAINS.ROCK);
  }
  const x = entrance.underground.x, y = entrance.underground.y;
  tunnel(layer, x, y, x, y + 9);
  tunnel(layer, x, y + 9, x - 12, y + 15);
  tunnel(layer, x, y + 9, x + 12, y + 14);
  disc(layer, x, y + 9, 5, 3, TERRAINS.CHAMBER);
  disc(layer, x - 12, y + 15, 5, 3, TERRAINS.CHAMBER);
  disc(layer, x + 12, y + 14, 4, 3, TERRAINS.CHAMBER);
  disc(layer, x, y, 2, 2, TERRAINS.TUNNEL);
  writeCell(layer, x, y, TERRAINS.ENTRANCE);
  return layer;
}
export function createWorld(seedText = 'ANT-001') {
  const seedLabel = String(seedText).trim() || 'ANT-001';
  const seed = normalizeSeed(seedLabel);
  const entrance = { id: 'nest-main', surface: { x: 64, y: 64 }, underground: { x: 48, y: 15 } };
  return {
    seed, seedLabel,
    entrances: [entrance],
    layers: { [SURFACE]: surface(seed, entrance), [UNDERGROUND]: underground(seed, entrance) }
  };
}
export function portalAt(world, layer, x, y) {
  return world.entrances.find(e => e[layer].x === x && e[layer].y === y) || null;
}
