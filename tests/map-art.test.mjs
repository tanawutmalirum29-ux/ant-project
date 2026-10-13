import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TERRAINS } from '../src/world/generate.js';
import { paintTerrainTile, terrainArtPalette, terrainArtIsSolid } from '../src/render/terrain-art.js';

function layer(rows) {
  return { width: rows[0].length, height: rows.length, cells: Uint8Array.from(rows.flat()) };
}
function recordingContext() {
  const trace = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key === 'trace') return trace;
      if (key in obj) return obj[key];
      if (typeof key === 'symbol') return undefined;
      return (...args) => trace.push([key, ...args.map(v => typeof v === 'number' ? Number(v.toFixed(5)) : v)]);
    },
    set(obj, key, value) { trace.push([key, value]); obj[key] = value; return true; }
  });
  return ctx;
}
const ids = Object.values(TERRAINS);
const mosaic = layer([
  [TERRAINS.GRASS,TERRAINS.DIRT,TERRAINS.THICKET,TERRAINS.WATER,TERRAINS.STONE],
  [TERRAINS.SOIL,TERRAINS.HARD_SOIL,TERRAINS.ROCK,TERRAINS.TUNNEL,TERRAINS.CHAMBER],
  [TERRAINS.SOIL,TERRAINS.ROCK,TERRAINS.TUNNEL,TERRAINS.ENTRANCE,TERRAINS.WATER]
]);
function trace(seed = 123, zoom = 1) {
  const ctx = recordingContext();
  for (let y=0;y<mosaic.height;y++) for(let x=0;x<mosaic.width;x++)
    paintTerrainTile(ctx, mosaic, seed, x, y, zoom);
  return ctx.trace;
}

test('every documented terrain has an explicit palette and fixed numeric value', () => {
  assert.equal(ids.length, 11);
  for (const code of ids) assert.match(terrainArtPalette[code], /^#[0-9a-f]{6}$/i);
  assert.equal(terrainArtIsSolid(TERRAINS.ROCK), true);
  assert.equal(terrainArtIsSolid(TERRAINS.HARD_SOIL), true);
  assert.equal(terrainArtIsSolid(TERRAINS.TUNNEL), false);
});
test('deterministic painting — same world/seed/zoom produces identical draw commands', () => {
  const a = trace(811, 1.35), b = trace(811, 1.35);
  assert.deepEqual(a,b);
  assert.notDeepEqual(a,trace(812,1.35));
});
test('snapshot of representative surface and underground styles', () => {
  const digest = createHash('sha256').update(JSON.stringify(trace(811, 1.35))).digest('hex');
  assert.equal(digest, 'b8bd2c1f86aa3c52a92c0d8aad7b59a8de3b0d599983ece491016f1b5800c4d8');
});
test('level of detail cuts draw calls at distant zoom without eliminating terrain distinctions', () => {
  const detailed=trace(811,1.4), distant=trace(811,.42);
  assert.ok(distant.length < detailed.length, `expected ${distant.length} < ${detailed.length}`);
  assert.equal(distant.filter(c=>c[0]==='fillRect').length, detailed.filter(c=>c[0]==='fillRect').length);
});
test('out of bounds is a no-op; painting never mutates cells', () => {
  const before=Array.from(mosaic.cells), ctx=recordingContext();
  paintTerrainTile(ctx,mosaic,123,-1,0,1);
  paintTerrainTile(ctx,mosaic,123,100,100,1);
  assert.equal(ctx.trace.length,0);
  paintTerrainTile(ctx,mosaic,123,2,1,1);
  assert.deepEqual(Array.from(mosaic.cells),before);
});
test('rock-facing-tunnel adds distinctive fracture outlines', () => {
  const seam=layer([[TERRAINS.ROCK,TERRAINS.TUNNEL]]);
  const isolated=layer([[TERRAINS.ROCK,TERRAINS.ROCK]]);
  const a=recordingContext(),b=recordingContext();
  paintTerrainTile(a,seam,5,0,0,1);
  paintTerrainTile(b,isolated,5,0,0,1);
  assert.ok(a.trace.length > b.trace.length);
  assert.ok(a.trace.some(c=>c[0]==='strokeStyle' && c[1]==='#a5b1a18c'));
});
