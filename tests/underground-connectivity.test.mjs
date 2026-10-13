import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, connectUndergroundGeology, TERRAINS, UNDERGROUND, cellAt, writeCell} from '../src/world/generate.js';
import {DIRECTIONS, isDiggable, isWalkable, findPath} from '../src/world/navigation.js';
import {Game} from '../src/core/game.js';

const nonRock=t=>t!==TERRAINS.ROCK;
function reachableGround(layer, start) {
  const {width:w,height:h,cells}=layer,found=new Uint8Array(cells.length);
  const source=start.y*w+start.x;
  if(!nonRock(cells[source]))return found;
  const queue=new Int32Array(cells.length);let head=0,tail=0;
  queue[tail++]=source;found[source]=1;
  while(head<tail) {
    const p=queue[head++],x=p%w,y=(p-x)/w;
    for(const [dx,dy] of DIRECTIONS){
      const xx=x+dx,yy=y+dy;
      if(xx<0||yy<0||xx>=w||yy>=h)continue;
      const to=yy*w+xx;
      if(!found[to]&&nonRock(cells[to])){found[to]=1;queue[tail++]=to;}
    }
  }
  return found;
}
function assertEveryRegionConnected(layer,start,label){
  const found=reachableGround(layer,start),{cells,width:w}=layer;
  for(let i=0;i<cells.length;i++){
    if(cells[i]===TERRAINS.ROCK)continue;
    assert.equal(found[i],1,`${label}: trapped tile ${i%w},${Math.floor(i/w)} (${cells[i]})`);
  }
}
function fixture(w=26,h=18){
  return {kind:UNDERGROUND,width:w,height:h,cells:new Uint8Array(w*h).fill(TERRAINS.ROCK)};
}
function box(layer,x,y,w,h,type){
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)writeCell(layer,xx,yy,type);
}
test('NO-POCKET-01 every diggable site of 120 seeds can connect to queen without passing unmineable stone',()=>{
  for(let i=0;i<120;i++){
    const seed=i<10?['ANT-001','alpha','999','long random-looking seed','forager',
      'geometry-ribs','outcrops-02','rainy-forest','very-dry-hills','seed-blade'][i]:`sealed-pocket-regression-${i}`;
    const w=createWorld(seed),layer=w.layers[UNDERGROUND],e=w.entrances[0].underground;
    const start={x:e.x,y:e.y+9};
    assertEveryRegionConnected(layer,start,seed);
    for(let x=0;x<layer.width;x++)for(const y of [0,1,layer.height-2,layer.height-1]){
      assert.equal(cellAt(layer,x,y),TERRAINS.ROCK,seed+' north/south outer rim');
    }
    for(let y=0;y<layer.height;y++)for(const x of [0,1,layer.width-2,layer.width-1]){
      assert.equal(cellAt(layer,x,y),TERRAINS.ROCK,seed+' east/west outer rim');
    }
  }
});
test('NO-POCKET-02 repair inaccessible larger regions with diggable narrow corridors while keeping bedrock',()=>{
  const l=fixture();
  box(l,3,4,4,5,TERRAINS.CHAMBER);
  box(l,16,9,5,4,TERRAINS.SOIL);
  writeCell(l,12,4,TERRAINS.SOIL); // orphan micro speck
  const before=l.cells.slice();
  const stats=connectUndergroundGeology(l,{x:4,y:5});
  assert.ok(stats.bridges>=1,JSON.stringify(stats));
  assert.ok(stats.carved>0 && stats.carved<22,JSON.stringify(stats));
  assert.equal(stats.filled,1);
  assert.equal(cellAt(l,12,4),TERRAINS.ROCK,'tiny unreachable dirt fleck is not a fake room');
  assertEveryRegionConnected(l,{x:4,y:5},'synthetic large chamber');
  assert.equal(cellAt(l,16,10),TERRAINS.SOIL,'preserve remote soft soil');
  assert.equal(cellAt(l,0,0),TERRAINS.ROCK);
  for(let i=0;i<l.cells.length;i++){
    if(before[i]===TERRAINS.ROCK && l.cells[i]!==TERRAINS.ROCK)
      assert.equal(l.cells[i],TERRAINS.HARD_SOIL,'minimal bridge must remain diggable');
  }
});
test('NO-POCKET-03 even one isolated existing tunnel or chamber must be connected, not filled or destroyed',()=>{
  const l=fixture();
  box(l,3,4,5,5,TERRAINS.CHAMBER);
  writeCell(l,18,11,TERRAINS.TUNNEL);
  const stats=connectUndergroundGeology(l,{x:4,y:5});
  assert.ok(stats.bridges>=1);
  assert.equal(cellAt(l,18,11),TERRAINS.TUNNEL);
  assertEveryRegionConnected(l,{x:4,y:5},'real room floor');
});
test('NO-POCKET-04 generator never leaves separate walkable cave networks or obstructs queen, ants and first rooms',()=>{
  for(let i=0;i<24;i++){
    const g=new Game(`playable-tunnel-${i}`),l=g.world.layers[UNDERGROUND],q=g.colony.queen;
    const walked=new Uint8Array(l.cells.length),queue=[{x:q.x,y:q.y}];
    walked[q.y*l.width+q.x]=1;
    for(let at=0;at<queue.length;at++){
      const p=queue[at];
      for(const [dx,dy] of DIRECTIONS){
        const x=p.x+dx,y=p.y+dy;
        if(!isWalkable(l,x,y))continue;
        const k=y*l.width+x;
        if(walked[k])continue;
        walked[k]=1;queue.push({x,y});
      }
    }
    for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++)
      if(isWalkable(l,x,y))assert.equal(walked[y*l.width+x],1,'detached open area');
    for(const ant of [q,...g.colony.workers])assert.equal(walked[ant.y*l.width+ant.x],1);
    Object.assign(g.foraging.inventory,{carbs:24,protein:24,water:24});
    assert.equal(g.rooms.validate('nursery',q.x-4,q.y-1,2,3).ok,true);
  }
});
test('NO-POCKET-05 workers can eventually enter remote ground by digging only SOIL/HARD_SOIL',()=>{
  for(const seed of ['passage-alpha','passage-beta','passage-gamma']){
    const g=new Game(seed),l=g.world.layers[UNDERGROUND],q=g.colony.queen;
    const n=l.width*l.height,prev=new Int32Array(n).fill(-1),queue=new Int32Array(n);
    const seen=new Uint8Array(n),start=q.y*l.width+q.x;
    seen[start]=1;queue[0]=start;let head=0,tail=1;
    while(head<tail){
      const cur=queue[head++],x=cur%l.width,y=(cur-x)/l.width;
      for(const [dx,dy] of DIRECTIONS){
        const xx=x+dx,yy=y+dy,k=yy*l.width+xx;
        if(xx<0||yy<0||xx>=l.width||yy>=l.height||seen[k]||cellAt(l,xx,yy)===TERRAINS.ROCK)continue;
        seen[k]=1;prev[k]=cur;queue[tail++]=k;
      }
    }
    let remote=-1;
    for(let i=0;i<n;i++)if(seen[i]&&isDiggable(l,i%l.width,Math.floor(i/l.width)) &&
       Math.abs(i%l.width-q.x)+Math.abs(Math.floor(i/l.width)-q.y)>20){remote=i;break;}
    assert.ok(remote>=0,seed+' must support large reachable expansion');
    const path=[];
    for(let at=remote;at!==start;at=prev[at]){assert.ok(at>=0);path.push(at);}
    path.reverse();
    for(const pos of path){
      const x=pos%l.width,y=Math.floor(pos/l.width),tile=cellAt(l,x,y);
      if(isDiggable(l,x,y))writeCell(l,x,y,TERRAINS.TUNNEL);
      else assert.ok(isWalkable(l,x,y),seed+' no unmineable step in route');
    }
    const dest={x:remote%l.width,y:Math.floor(remote/l.width)};
    assert.ok(findPath(l,q,dest),seed+' previously sealed area must be physically walkable after excavation');
  }
});
