import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, TERRAINS, SURFACE, UNDERGROUND, cellAt } from '../src/world/generate.js';
import { isWalkable, isDiggable, findPath, reachablePaths, DIRECTIONS } from '../src/world/navigation.js';
import { createResourceNodes } from '../src/world/resources.js';
import { Game } from '../src/core/game.js';
const seeds=['ANT-001','alpha','999','long random-looking seed','forager',
 'geometry-ribs','outcrops-02','rainy-forest','very-dry-hills','seed-blade'];
const count=(layer,terrain)=>layer.cells.reduce((n,v)=>n+(v===terrain?1:0),0);
const pct=(layer,t)=>count(layer,t)/layer.cells.length;
const neighbors=(layer,x,y,t)=>DIRECTIONS.reduce((n,[dx,dy])=>n+(cellAt(layer,x+dx,y+dy)===t?1:0),0);

test('GEO-01 stable generation with the original dimensions and terraforming contract',()=>{
  for(const seed of seeds){
    const a=createWorld(seed),b=createWorld(seed);
    assert.deepEqual(a.layers[SURFACE].cells,b.layers[SURFACE].cells,seed+' surface');
    assert.deepEqual(a.layers[UNDERGROUND].cells,b.layers[UNDERGROUND].cells,seed+' underground');
    assert.equal(a.layers[SURFACE].cells.length,128*128);
    assert.equal(a.layers[UNDERGROUND].cells.length,96*64);
    for(const l of [a.layers[SURFACE],a.layers[UNDERGROUND]])
      for(const v of l.cells)assert.ok(Object.values(TERRAINS).includes(v));
    for(const type of [SURFACE,UNDERGROUND]){
      const e=a.entrances[0][type];
      assert.equal(cellAt(a.layers[type],e.x,e.y),TERRAINS.ENTRANCE);
    }
  }
  assert.notDeepEqual(createWorld('alpha').layers[UNDERGROUND].cells,
    createWorld('beta').layers[UNDERGROUND].cells);
});
test('GEO-02 permanent stone supports are common, clustered and exactly undiggable',()=>{
  for(const seed of seeds){
    const l=createWorld(seed).layers[UNDERGROUND],total=l.width*l.height;
    const rock=count(l,TERRAINS.ROCK),soil=count(l,TERRAINS.SOIL);
    const hard=count(l,TERRAINS.HARD_SOIL);
    assert.ok(rock/total>.20&&rock/total<.68,seed+': rock '+rock+'/'+total);
    assert.ok(soil/total>.09,seed+': too little soft soil');
    assert.ok(hard/total>.10,seed+': too little hard soil');
    let clusters=0,supports=0;
    for(let y=4;y<l.height-4;y++)for(let x=4;x<l.width-4;x++){
      if(cellAt(l,x,y)!==TERRAINS.ROCK)continue;
      clusters++;
      if(neighbors(l,x,y,TERRAINS.ROCK)>=2)supports++;
      assert.equal(isDiggable(l,x,y),false,seed+' bedrock must never be diggable');
      assert.equal(isWalkable(l,x,y),false);
    }
    assert.ok(clusters>250,seed+': bedrock must exist inside map');
    assert.ok(supports/clusters>.75,seed+': rock should form connected supports, not noise');
  }
});
test('GEO-03 natural non-diggable map boundary remains intact for every seed',()=>{
  for(const seed of seeds){
    const l=createWorld(seed).layers[UNDERGROUND];
    for(let x=0;x<l.width;x++)for(const y of [0,1,l.height-2,l.height-1])
      assert.equal(cellAt(l,x,y),TERRAINS.ROCK,`${seed}: horizontal boundary`);
    for(let y=0;y<l.height;y++)for(const x of [0,1,l.width-2,l.width-1])
      assert.equal(cellAt(l,x,y),TERRAINS.ROCK,`${seed}: vertical boundary`);
  }
});
test('GEO-04 birth chamber and all three starter tunnels stay connected with excavation frontiers',()=>{
  for(const seed of seeds){
    const g=new Game(seed),l=g.world.layers[UNDERGROUND],q=g.colony.queen;
    const e=g.world.entrances[0].underground;
    const reach=reachablePaths(l,q);
    assert.ok(reach,seed+': queen must have a traversable tile');
    assert.ok(findPath(l,q,e),seed+': entrance must reach queen');
    for(const spot of [{x:q.x-12,y:q.y+6},{x:q.x+12,y:q.y+5}])
      assert.ok(findPath(l,q,spot),seed+': both side chambers must be accessible');
    let diggableFrontier=0;
    for(let y=3;y<l.height-3;y++)for(let x=3;x<l.width-3;x++){
      if(!isDiggable(l,x,y))continue;
      if(DIRECTIONS.some(([dx,dy])=>reach.distance(x+dx,y+dy)>=0))
        diggableFrontier++;
    }
    assert.ok(diggableFrontier>=12,seed+': should have multiple expansion exits: '+diggableFrontier);
    for(const a of [q,...g.colony.workers])
      assert.ok(reach.distance(a.x,a.y)>=0,seed+': no ant inside bedrock');
    const room=g.rooms.validate('food_store',q.x-4,q.y-1,2,3);
    assert.equal(room.ok,true,seed+': starter room construction must stay possible: '+room.reason);
  }
});
test('GEO-05 no dig order may turn natural support rock into an empty chamber',()=>{
  for(const seed of seeds.slice(0,4)){
    const g=new Game(seed),l=g.world.layers[UNDERGROUND];
    let rock=null;
    for(let y=6;y<l.height-6&&!rock;y++)for(let x=6;x<l.width-6&&!rock;x++)
      if(cellAt(l,x,y)===TERRAINS.ROCK)rock={x,y};
    assert.ok(rock);
    const before=cellAt(l,rock.x,rock.y);
    const res=g.colony.queueRectangle(rock,rock);
    assert.equal(res.blocked,1);
    assert.equal(res.added,0);
    for(let i=0;i<250;i++)g.update(100);
    assert.equal(cellAt(l,rock.x,rock.y),before);
  }
});
test('GEO-06 surface biome mosaic retains all terrain categories and reachable initial foraging',()=>{
  for(const seed of seeds){
    const w=createWorld(seed),l=w.layers[SURFACE],entry=w.entrances[0].surface;
    for(const t of [TERRAINS.GRASS,TERRAINS.DIRT,TERRAINS.THICKET,TERRAINS.WATER,TERRAINS.STONE])
      assert.ok(pct(l,t)>.002,`${seed}: missing surface terrain ${t}`);
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
      if(dx*dx/81+dy*dy/49<=1&&dx+dy!==0)
        assert.equal(isWalkable(l,entry.x+dx,entry.y+dy),true,seed+': spawn meadow obstructed');
    const nodes=createResourceNodes(w);
    assert.equal(nodes.length,24,seed+': sufficient connected resource nodes');
    const reach=reachablePaths(l,entry);
    for(const resource of nodes)
      assert.ok(reach.distance(resource.x,resource.y)>=6,seed+': initial food unreachable');
  }
});
test('GEO-07 rock pillar continuity beats isolated solitary pebble distribution',()=>{
  for(const seed of seeds.slice(0,5)){
    const l=createWorld(seed).layers[UNDERGROUND];
    let tall=0,wide=0;
    for(let y=7;y<l.height-9;y++)for(let x=7;x<l.width-9;x++){
      if(cellAt(l,x,y)!==TERRAINS.ROCK)continue;
      if([1,2,3,4,5].every(d=>cellAt(l,x,y+d)===TERRAINS.ROCK))tall++;
      if([1,2,3,4,5].every(d=>cellAt(l,x+d,y)===TERRAINS.ROCK))wide++;
    }
    assert.ok(tall>30&&wide>30,`${seed}: geology should supply solid structural runs (vertical ${tall}, horizontal ${wide})`);
  }
});
