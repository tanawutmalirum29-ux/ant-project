import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { UNDERGROUND, SURFACE, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { findPath, isWalkable, isDiggable, reachablePaths } from '../src/world/navigation.js';
import { MAX_ORDERS, WORKER_COUNT, digTicks } from '../src/core/colony.js';

function frontier(layer, predicate = () => true) {
  for (let y=2;y<layer.height-2;y++) for(let x=2;x<layer.width-2;x++) {
    if(!isDiggable(layer,x,y)||!predicate(x,y))continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>isWalkable(layer,x+dx,y+dy)))return {x,y};
  }
  throw new Error('No frontier found');
}
function run(game,steps) {for(let i=0;i<steps;i++)game.update(100);}

test('U2.1 queen and five unique workers always spawn on valid connected underground tiles', () => {
  for(const seed of ['ANT-001','alpha','999','long random-looking seed','forager']) {
    const g=new Game(seed), layer=g.world.layers[UNDERGROUND];
    assert.equal(g.population,6);assert.equal(g.colony.workers.length,WORKER_COUNT);
    assert.equal(new Set(g.colony.workers.map(w=>w.id)).size,WORKER_COUNT);
    assert.equal(g.colony.queen.caste,'queen');
    for(const ant of [g.colony.queen,...g.colony.workers]) {
      assert.ok(isWalkable(layer,ant.x,ant.y));
      assert.notEqual(findPath(layer,ant,g.colony.queen),null);
    }
  }
});
test('U2.2 A* is deterministic, cardinal-only, and never enters blocked dirt or rock',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND],a=g.colony.workers[0],q=g.colony.queen;
  const path=findPath(l,a,q);
  assert.ok(path?.length>0);
  let p=a;
  for(const cell of path){assert.equal(Math.abs(p.x-cell.x)+Math.abs(p.y-cell.y),1);assert.ok(isWalkable(l,cell.x,cell.y));p=cell;}
  assert.deepEqual(p,{x:q.x,y:q.y});assert.deepEqual(findPath(l,a,q),path);
  const f=frontier(l);
  assert.equal(findPath(l,a,f),null);
  assert.equal(findPath(l,{x:-1,y:1},q),null); // invalid source cannot pathfind
});
test('U2.3 dig queue rejects rocks, existing tunnels, duplicates and imposes safe size cap',()=>{
  const g=new Game('ANT-001'),layer=g.world.layers[UNDERGROUND],f=frontier(layer);
  assert.equal(g.colony.queueRectangle(f,f).added,1);
  assert.equal(g.colony.queueRectangle(f,f).existing,1);
  assert.equal(g.colony.queueRectangle(g.colony.queen,g.colony.queen).blocked,1);
  const rock={x:1,y:1};writeCell(layer,rock.x,rock.y,TERRAINS.ROCK);
  assert.equal(g.colony.queueRectangle(rock,rock).blocked,1);
  const result=g.colony.queueRectangle({x:0,y:0},{x:95,y:63});
  assert.ok(result.limit);assert.equal(g.colony.pendingCount,MAX_ORDERS);
  assert.equal(g.colony.orders.size,g.colony.ordersById.size);
});
test('U2.4 five workers reserve distinct jobs and eventually carve queued frontier',()=>{
  const g=new Game('ANT-001'), l=g.world.layers[UNDERGROUND], f=frontier(l);
  g.colony.queueRectangle(f,f);
  const original=cellAt(l,f.x,f.y);
  run(g,1);
  assert.notEqual(cellAt(l,f.x,f.y),TERRAINS.TUNNEL);
  assert.equal(g.colony.workers.filter(w=>w.orderId!=null).length,1);
  run(g,350);
  assert.equal(cellAt(l,f.x,f.y),TERRAINS.TUNNEL);
  assert.equal(g.colony.completed,1);assert.equal(g.colony.pendingCount,0);
  assert.equal(g.colony.workers.filter(w=>w.orderId!=null).length,0);
  assert.ok(digTicks(original)>=12);
});
test('U2.5 queued inaccessible soil is mined in order after tunneling reaches it',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND];
  let f=null,far=null;
  for(let y=2;y<l.height-2&&!f;y++)for(let x=2;x<l.width-2&&!f;x++) {
    if(!isDiggable(l,x,y))continue;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs) {
      if(isWalkable(l,x-dx,y-dy)&&isDiggable(l,x+dx,y+dy)) {
        f={x,y};far={x:x+dx,y:y+dy};break;
      }
    }
  }
  assert.ok(f && far);
  g.colony.queueRectangle(f,f);g.colony.queueRectangle(far,far);
  run(g,1);
  assert.equal(g.colony.ordersById.size,2);
  run(g,500);
  assert.equal(cellAt(l,f.x,f.y),TERRAINS.TUNNEL);
  assert.equal(cellAt(l,far.x,far.y),TERRAINS.TUNNEL);
  assert.equal(g.colony.completed,2);
});
test('U2.6 cancel assigned dig frees worker, preserves terrain, and never resurrects order',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND],f=frontier(l),was=cellAt(l,f.x,f.y);
  g.colony.queueRectangle(f,f);run(g,12);
  assert.equal(g.colony.cancel(f.x,f.y),true);
  assert.equal(g.colony.cancel(f.x,f.y),false);
  run(g,100);
  assert.equal(cellAt(l,f.x,f.y),was);assert.equal(g.colony.completed,0);
  assert.equal(g.colony.pendingCount,0);assert.equal(g.colony.busyCount,0);
});
test('U2.7 pause, speed, and layer changes do not duplicate work or lose progress',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND],f=frontier(l);
  g.colony.queueRectangle(f,f);
  g.setSpeed(0);run(g,500);
  assert.equal(g.clock.ticks,0);assert.equal(g.colony.completed,0);
  g.setSpeed(2);g.setLayer(SURFACE);run(g,180);
  assert.equal(cellAt(l,f.x,f.y),TERRAINS.TUNNEL);
  assert.equal(g.colony.completed,1);assert.equal(g.colony.pendingCount,0);
  g.setLayer(UNDERGROUND);run(g,200);
  assert.equal(g.colony.completed,1);
});
test('U2.8 blocked and unreachable orders are not mined by teleporting workers',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND];
  const f=frontier(l);let target=null;
  for(let y=2;y<l.height-2&&!target;y++)for(let x=2;x<l.width-2&&!target;x++) {
    if(!isDiggable(l,x,y))continue;
    if([[0,1],[0,-1],[-1,0],[1,0]].every(([dx,dy])=>!isWalkable(l,x+dx,y+dy)))target={x,y};
  }
  assert.ok(target);
  g.colony.queueRectangle(target,target);
  run(g,250);
  assert.equal(g.colony.completed,0);
  assert.equal(g.colony.pendingCount,1);
  for(const w of g.colony.workers)assert.ok(isWalkable(g.world.layers[w.layer],w.x,w.y));
  const reachable=reachablePaths(l,g.colony.workers[0]);
  assert.equal(reachable.distance(target.x,target.y),-1);
  assert.ok(f);
});
test('U2.9 stress: hundreds of orders stay unique and never change rocks',()=>{
  const g=new Game('ANT-001'),l=g.world.layers[UNDERGROUND];
  const originalRock=[];
  for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++)if(cellAt(l,x,y)===TERRAINS.ROCK)originalRock.push([x,y]);
  g.colony.queueRectangle({x:15,y:10},{x:75,y:52});
  run(g,400);
  assert.ok(g.colony.orders.size<=MAX_ORDERS);
  assert.equal(g.colony.ordersById.size,g.colony.orders.size);
  for(const [x,y] of originalRock)assert.equal(cellAt(l,x,y),TERRAINS.ROCK);
  for(const w of g.colony.workers)assert.ok(isWalkable(g.world.layers[w.layer],w.x,w.y));
});
