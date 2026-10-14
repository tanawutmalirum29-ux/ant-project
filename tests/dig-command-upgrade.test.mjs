import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { UI } from '../src/ui/app.js';
import { UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';
import { DIRECTIONS, findExcavationRoute, isDiggable, isWalkable } from '../src/world/navigation.js';

function remoteTarget(game){
  const l=game.world.layers[UNDERGROUND],starts=game.colony.workers;
  const options=[];
  for(let y=3;y<l.height-3;y++)for(let x=3;x<l.width-3;x++){
    if(!isDiggable(l,x,y))continue;
    if(DIRECTIONS.some(([dx,dy])=>isWalkable(l,x+dx,y+dy)))continue;
    options.push({x,y});
  }
  const route=findExcavationRoute(l,starts,options);
  assert.ok(route,'seed must contain an excavatable remote deposit');
  return route.target;
}
function tick(colony,n){for(let i=0;i<n;i++)colony.tick();}
const seed='ANT-001';

test('DIG-ACCESS-01: a remote soil order generates a connected, physical corridor automatically',()=>{
  const game=new Game(seed),c=game.colony,l=game.world.layers[UNDERGROUND];
  const dest=remoteTarget(game),rock=[];
  for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++)
    if(cellAt(l,x,y)===TERRAINS.ROCK)rock.push(y*l.width+x);
  assert.equal(c.queueRectangle(dest,dest).added,1);
  tick(c,1);
  const helpers=[...c.orders.values()].filter(j=>j.auto);
  assert.equal(helpers.length,1,'first approach tile is reserved as a helper job');
  const h=helpers[0];
  assert.ok(DIRECTIONS.some(([dx,dy])=>isWalkable(l,h.x+dx,h.y+dy)),
    'the access step is adjacent to an existing tunnel');
  for(let n=0;n<2400 && c.getOrder(dest.x,dest.y);n++)c.tick();
  assert.equal(cellAt(l,dest.x,dest.y),TERRAINS.TUNNEL,'the remote destination eventually opens');
  assert.equal(c.pendingCount,0);
  assert.equal(c.busyCount,0);
  for(const i of rock)assert.equal(l.cells[i],TERRAINS.ROCK,'never carve through bedrock');
  for(const ant of c.workers)assert.ok(isWalkable(l,ant.x,ant.y));
});

test('DIG-CANCEL-02: drag bounds cancel many orders, release workers, retain terrain',()=>{
  const game=new Game(seed),c=game.colony,l=game.world.layers[UNDERGROUND];
  const dest=remoteTarget(game),original=cellAt(l,dest.x,dest.y);
  c.queueRectangle(dest,dest);c.tick();
  assert.ok([...c.orders.values()].some(job=>job.auto));
  assert.equal(c.inspectRectangle(dest,dest).existing,1);
  assert.equal(c.cancelRectangle(dest,dest).cancelled,1);
  assert.equal(c.pendingCount,0,'orphan access work is discarded');
  tick(c,150);
  assert.equal(cellAt(l,dest.x,dest.y),original);
  assert.equal(c.busyCount,0);
  assert.equal(c.queueRectangle(dest,dest).added,1,'cancelled region can be selected again');
});

test('DIG-CANCEL-03: overlapping rectangles only cancel selected jobs, never finished tunnels',()=>{
  const game=new Game(seed),c=game.colony,l=game.world.layers[UNDERGROUND];
  const coords=[];
  for(let y=3;y<l.height-3&&coords.length<3;y++)for(let x=3;x<l.width-3&&coords.length<3;x++)
    if(isDiggable(l,x,y))coords.push({x,y});
  assert.equal(coords.length,3);
  for(const p of coords)assert.equal(c.queueRectangle(p,p).added,1);
  assert.equal(c.queueRectangle(coords[0],coords[0]).existing,1);
  assert.equal(c.cancelRectangle(coords[0],coords[0]).cancelled,1);
  assert.equal(c.getOrder(coords[0].x,coords[0].y),null);
  assert.ok(c.getOrder(coords[1].x,coords[1].y));
  assert.equal(c.pendingCount,2);
  assert.equal(c.cancelRectangle({x:0,y:0},{x:l.width-1,y:l.height-1}).cancelled,2);
  assert.equal(c.cancelRectangle({x:0,y:0},{x:l.width-1,y:l.height-1}).cancelled,0);
});

test('DIG-ACCESS-04: fully enclosed soil stays queued without teleporting into rock',()=>{
  const game=new Game(seed),c=game.colony,l=game.world.layers[UNDERGROUND];
  const p=remoteTarget(game);
  for(const [dx,dy] of DIRECTIONS)writeCell(l,p.x+dx,p.y+dy,TERRAINS.ROCK);
  assert.equal(findExcavationRoute(l,c.workers,[p]),null);
  c.queueRectangle(p,p);
  const before=c.workers.map(w=>({x:w.x,y:w.y}));
  tick(c,60);
  assert.equal(c.pendingCount,1);
  assert.equal(c.accessBlocked,true);
  assert.equal(cellAt(l,p.x,p.y)===TERRAINS.TUNNEL,false);
  assert.deepEqual(c.workers.map(w=>({x:w.x,y:w.y})),before);
});

test('DIG-UI-05: bulk-cancel action delegates selected rectangle to colony exactly once',()=>{
  const calls=[],from={x:7,y:8},to={x:10,y:11};
  const mock={
    digSelection:{from,to},
    game:{colony:{cancelRectangle:(a,b)=>{calls.push([a,b]);return {cancelled:4};}}},
    clearDigSelection(){this.digSelection=null;},
    notice(message){this.message=message;},
    refreshSelection(){},updateMetrics(){}
  };
  UI.prototype.applyDigSelection.call(mock,true);
  assert.deepEqual(calls,[[from,to]]);
  assert.equal(mock.digSelection,null);
  assert.match(mock.message,/4/);
  UI.prototype.applyDigSelection.call(mock,true);
  assert.equal(calls.length,1,'stale UI cannot repeat a cancellation');
});
