import { createRandom, normalizeSeed, tileHash } from '../core/random.js';
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
/** Multi-scale edge irregularity keeps deposits joined instead of confetti dots.
 * Uses only the original terrain IDs, preserving navigation and dig contracts. */
function patch(layer, cx, cy, rx, ry, terrain, seed, salt) {
  const xmin=Math.max(0,Math.floor(cx-rx-1)),xmax=Math.min(layer.width-1,Math.ceil(cx+rx+1));
  const ymin=Math.max(0,Math.floor(cy-ry-1)),ymax=Math.min(layer.height-1,Math.ceil(cy+ry+1));
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++) {
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    const coarse=tileHash(seed,x>>2,y>>2,salt);
    const fine=tileHash(seed,x,y,salt^0x7154a291);
    const boundary=1+(coarse-.5)*.32+(fine-.5)*.17;
    if(dx*dx+dy*dy<=boundary)writeCell(layer,x,y,terrain);
  }
}
/** A finite wandering geology seam; never a map-spanning impassable wall. */
function ribbon(layer, rng, seed, type, x, y, length, width, vertical, salt) {
  let drift=0;
  for(let i=0;i<length;i++) {
    if(i%3===0)drift=Math.max(-2,Math.min(2,drift+rng.int(-1,1)));
    const px=Math.round(x+(vertical?drift:i)),py=Math.round(y+(vertical?i:drift));
    patch(layer,px,py,vertical?width:2,vertical?2:width,type,seed,salt+i*17);
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
  const layer=makeLayer(SURFACE),rng=createRandom(seed^0xa81c7e);
  layer.cells.fill(TERRAINS.GRASS);

  // Open meadows and winding dry ground, followed by vegetation clusters.
  for(let i=0;i<58;i++){
    const x=rng.int(5,122),y=rng.int(5,122);
    patch(layer,x,y,rng.int(3,11),rng.int(2,7),TERRAINS.DIRT,seed,0x1000+i);
  }
  for(let i=0;i<18;i++){
    const vertical=rng.next()<.5,x=rng.int(10,104),y=rng.int(10,104);
    ribbon(layer,rng,seed,TERRAINS.DIRT,x,y,rng.int(7,18),rng.int(1,3),vertical,0x2000+i*47);
  }
  for(let i=0;i<90;i++){
    patch(layer,rng.int(3,124),rng.int(3,124),rng.int(2,7),rng.int(2,6),
      TERRAINS.THICKET,seed,0x3000+i);
  }

  // Ponds are small lakes with earthen shorelines and a few short tributaries,
  // not a single solid river splitting the whole foraging map.
  for(let i=0;i<19;i++){
    const x=rng.int(8,119),y=rng.int(8,119);
    const rx=rng.int(2,5),ry=rng.int(2,4);
    patch(layer,x,y,rx+2,ry+2,TERRAINS.DIRT,seed,0x4000+i);
    patch(layer,x,y,rx,ry,TERRAINS.WATER,seed,0x5000+i);
  }
  for(let i=0;i<6;i++){
    const x=rng.int(9,108),y=rng.int(9,108),vertical=rng.next()<.5;
    ribbon(layer,rng,seed,TERRAINS.WATER,x,y,rng.int(5,11),1,vertical,0x6000+i);
  }
  // Rock outcrops are coherent stone fields, not evenly spaced single tiles.
  for(let i=0;i<33;i++){
    patch(layer,rng.int(5,122),rng.int(5,122),rng.int(1,4),rng.int(1,3),
      TERRAINS.STONE,seed,0x7000+i);
  }
  for(let i=0;i<115;i++){
    const x=rng.int(1,126),y=rng.int(1,126);
    if(cellAt(layer,x,y)===TERRAINS.GRASS&&rng.next()<.67)
      writeCell(layer,x,y,TERRAINS.STONE);
  }

  // Permanent starting meadow/forage exits, including the +11 x combat
  // spawn ring. The same meadow protects early resource and enemy pathfinding. Resource spawning starts at this
  // shared portal; do not enclose it with thicket, water or stone.
  const e=entrance.surface;
  disc(layer,e.x,e.y,14,11,TERRAINS.DIRT);
  writeCell(layer,e.x,e.y,TERRAINS.ENTRANCE);
  return layer;
}
function underground(seed, entrance) {
  const layer=makeLayer(UNDERGROUND),rng=createRandom(seed^0x15c0ffee);
  layer.cells.fill(TERRAINS.SOIL);
  const w=layer.width,h=layer.height;

  // Strata: soft soil between coherent, slow-to-dig hard clay beds.
  for(let i=0;i<90;i++) {
    patch(layer,rng.int(3,w-4),rng.int(3,h-4),rng.int(3,10),rng.int(2,5),
      TERRAINS.HARD_SOIL,seed,0x8000+i);
  }

  // Compact permanent bedrock islands are future room support pillars. Veins
  // and short craggy ribs give shapes to carve AROUND, not uniform empty space.
  for(let i=0;i<54;i++) {
    patch(layer,rng.int(5,w-6),rng.int(5,h-6),rng.int(2,7),rng.int(2,5),
      TERRAINS.ROCK,seed,0x9000+i);
  }
  for(let i=0;i<17;i++) {
    const vertical=rng.next()<.62,x=rng.int(7,w-24),y=rng.int(6,h-23);
    ribbon(layer,rng,seed,TERRAINS.ROCK,x,y,rng.int(7,15),
      rng.int(1,2),vertical,0xa000+i*53);
  }
  // Tall/flat buttresses form naturally useful boundaries without sealing off
  // entire regions. Breaks remain around every finite ridge.
  for(let i=0;i<13;i++) {
    const vertical=i%3!==0,x=rng.int(7,w-18),y=rng.int(7,h-20);
    patch(layer,x,y,vertical?rng.int(1,3):rng.int(4,8),
      vertical?rng.int(5,10):rng.int(1,3),TERRAINS.ROCK,seed,0xb000+i);
  }

  // Subsurface rock boundary stops players from digging the world into a
  // giant rectangular empty box. Irregular edge width reads as natural bedrock.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const rim=2+Math.floor(tileHash(seed,x>>2,y>>2,0xca11)*2);
    if(x<rim||y<rim||x>=w-rim||y>=h-rim)writeCell(layer,x,y,TERRAINS.ROCK);
  }

  // Broken sediment against bedrock, always diggable (ROCK never downgraded).
  const old=layer.cells.slice();
  for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
    const at=y*w+x;
    if(old[at]!==TERRAINS.SOIL)continue;
    if(old[at-1]===TERRAINS.ROCK||old[at+1]===TERRAINS.ROCK||
       old[at-w]===TERRAINS.ROCK||old[at+w]===TERRAINS.ROCK){
      if(tileHash(seed,x,y,0xdd52)<.58)layer.cells[at]=TERRAINS.HARD_SOIL;
    }
  }

  // Keep virgin regions solid until workers dig toward them. Disconnected
  // pre-opened pockets masquerade as reachable work frontiers to old schedulers,
  // causing first mining assignments to get stuck. Rock/soil pockets still
  // provide exploration variety without an artificial teleportable cavern.

  // The original three start rooms, starter paths and every spawn coordinate
  // are the last word: no geological deposit can obstruct the initial colony.
  const x=entrance.underground.x,y=entrance.underground.y;
  tunnel(layer,x,y,x,y+9);
  tunnel(layer,x,y+9,x-12,y+15);
  tunnel(layer,x,y+9,x+12,y+14);
  disc(layer,x,y+9,5,3,TERRAINS.CHAMBER);
  disc(layer,x-12,y+15,5,3,TERRAINS.CHAMBER);
  disc(layer,x+12,y+14,4,3,TERRAINS.CHAMBER);
  disc(layer,x,y,2,2,TERRAINS.TUNNEL);
  writeCell(layer,x,y,TERRAINS.ENTRANCE);
  return layer;
}
export function createWorld(seedText='ANT-001'){
  const seedLabel=String(seedText).trim()||'ANT-001';
  const seed=normalizeSeed(seedLabel);
  const entrance={id:'nest-main',surface:{x:64,y:64},underground:{x:48,y:15}};
  return {
    seed,seedLabel,
    entrances:[entrance],
    layers:{[SURFACE]:surface(seed,entrance),[UNDERGROUND]:underground(seed,entrance)}
  };
}
export function portalAt(world,layer,x,y){
  return world.entrances.find(e=>e[layer].x===x&&e[layer].y===y)||null;
}
