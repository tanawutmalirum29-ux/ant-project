import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { LIFE } from '../src/core/lifecycle.js';
import { UNDERGROUND, TERRAINS, writeCell, cellAt } from '../src/world/generate.js';
import { isWalkable } from '../src/world/navigation.js';

const run=(g,n)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1)};
const key=b=>b.x+','+b.y;
function fixture(seed='brood-placement') {
  const g=new Game(seed);
  g.colony.setForageSlots(0);
  Object.assign(g.foraging.inventory,{carbs:22,protein:22,water:22});
  return g;
}
test('BROOD-01 | without a nursery or nurses, eggs occupy distinct reachable floor tiles, not the queen tile',()=>{
  const g=fixture('no-nursery-no-nurses');
  g.lifecycle.setNurseSlots(0);
  run(g,LIFE.layInterval*3);
  const brood=g.lifecycle.brood,q=g.colony.queen;
  assert.equal(brood.length,3);
  assert.equal(new Set(brood.map(key)).size,brood.length,'no overlapping eggs/larvae/pupae');
  for(const b of brood) {
    assert.ok(isWalkable(g.world.layers[UNDERGROUND],b.x,b.y));
    assert.ok(b.x!==q.x||b.y!==q.y,'queen herself is never the brood cache');
    assert.ok(Math.abs(b.x-q.x)+Math.abs(b.y-q.y)<=3);
    assert.equal(b.roomId,null);
  }
  assert.equal(g.lifecycle.consumed.protein,brood.length,'one real protein consumed per egg');
  assert.equal(g.rooms.rooms.length,1);
});
test('BROOD-02 | nurses physically carry brood to distinct temporary staging tiles',()=>{
  const g=fixture('brood-temporary-transport');
  g.lifecycle.setNurseSlots(1);
  let carryMovement=false,positions=new Map();
  for(let i=0;i<650;i++){
    const before=new Map(g.colony.workers.map(w=>[w.id,{x:w.x,y:w.y}]));
    run(g,1);
    for(const w of g.colony.workers){
      if(w.broodCargo){
        const baby=g.lifecycle.brood.find(b=>b.id===w.broodCargo);
        assert.ok(baby);
        assert.equal(baby.carrierId,w.id);
        assert.equal(baby.x,w.x);assert.equal(baby.y,w.y);
        assert.ok(Math.abs(w.x-before.get(w.id).x)+Math.abs(w.y-before.get(w.id).y)<=1);
        if(key(w)!==key(before.get(w.id)))carryMovement=true;
      }
    }
    for(const b of g.lifecycle.brood)if(b.site==='temporary'){
      assert.ok(isWalkable(g.world.layers[UNDERGROUND],b.x,b.y));
      assert.ok(Math.abs(b.x-g.colony.queen.x)+Math.abs(b.y-g.colony.queen.y)>=4);
    }
  }
  assert.ok(carryMovement,'physical ant carried at least one brood across tiles');
  assert.ok(g.lifecycle.brood.some(b=>b.site==='temporary'));
  const settled=g.lifecycle.brood.filter(b=>!b.carrierId);
  assert.equal(new Set(settled.map(key)).size,settled.length,'temporary sites must not stack brood');
  assert.equal(g.rooms.rooms.length,1,'temporary staging creates no free room');
});
test('BROOD-03 | completed nursery draws existing temporary brood by physical nurse delivery',()=>{
  const g=fixture('brood-relocate-to-room');
  g.lifecycle.setNurseSlots(1);
  run(g,420);
  assert.ok(g.lifecycle.brood.some(b=>b.site==='temporary'));
  const q=g.colony.queen;
  const order=g.rooms.queue('nursery',q.x-4,q.y);
  assert.ok(order.ok,'funded nursery construction');
  for(let i=0;i<350&&order.room.status!=='ready';i++)run(g,1);
  assert.equal(order.room.status,'ready');
  let carried=false;
  for(let i=0;i<520;i++){
    run(g,1);
    if(g.colony.workers.some(w=>w.broodCargo))carried=true;
    if(g.lifecycle.brood.some(b=>b.roomId===order.room.id))break;
  }
  const placed=g.lifecycle.brood.filter(b=>b.roomId===order.room.id);
  assert.ok(carried,'nursery delivery requires an actual carrier');
  assert.ok(placed.length>0);
  assert.ok(placed.every(b=>b.site==='nursery'&&b.x>=order.room.x&&b.x<order.room.x+2&&
    b.y>=order.room.y&&b.y<order.room.y+2));
  assert.ok(g.lifecycle.brood.length<=g.rooms.broodCapacity);
});
test('BROOD-04 | two nurses reserve different babies and destinations, not duplicate brood',()=>{
  const g=fixture('two-independent-nurses');
  g.lifecycle.setNurseSlots(2);
  for(let i=0;i<540;i++){
    run(g,1);
    const babies=g.lifecycle.brood;
    for(const nurse of g.colony.workers.filter(a=>a.broodCargo)) {
      assert.equal(babies.filter(b=>b.carrierId===nurse.id).length,1);
    }
    const targeted=babies.filter(b=>b.targetTile);
    assert.equal(new Set(targeted.map(b=>key(b.targetTile))).size,targeted.length,
      'incoming brood destination reservations are unique in temporary nest');
    assert.equal(new Set(babies.map(b=>b.id)).size,babies.length);
    const resting=babies.filter(b=>!b.carrierId);
    assert.equal(new Set(resting.map(key)).size,resting.length);
  }
});
test('BROOD-05 | nurse death drops carried brood at physical last tile without duplication',()=>{
  const g=fixture('brood-drop-on-death');
  g.lifecycle.setNurseSlots(1);
  let nurse=null;
  for(let i=0;i<220&&!nurse;i++){
    run(g,1);
    nurse=g.colony.workers.find(a=>a.broodCargo);
  }
  assert.ok(nurse,'nurse picks up first egg');
  const baby=g.lifecycle.brood.find(b=>b.carrierId===nurse.id);
  assert.ok(baby);
  const last={x:nurse.x,y:nurse.y},id=baby.id;
  const count=g.lifecycle.brood.length;
  assert.equal(g.lifecycle.killWorker(nurse),true);
  assert.equal(g.lifecycle.brood.length,count);
  assert.strictEqual(g.lifecycle.brood.find(b=>b.id===id),baby);
  assert.deepEqual({x:baby.x,y:baby.y},last);
  assert.equal(baby.carrierId,null);
  assert.equal(baby.pickupBy,null);
  assert.equal(baby.targetTile,null);
  assert.equal(baby.targetRoomId,null);
});
test('BROOD-06 | pause freezes brood tile positions, ages, reservations and ant carriers',()=>{
  const g=fixture('brood-freeze');
  run(g,210);
  const before=JSON.stringify({brood:g.lifecycle.brood,ants:g.colony.workers});
  g.setSpeed(0);
  for(let i=0;i<120;i++)assert.equal(g.update(100),0);
  assert.equal(JSON.stringify({brood:g.lifecycle.brood,ants:g.colony.workers}),before);
});
test('BROOD-07 | laying pauses when queen chamber is obstructed, without wasting protein',()=>{
  const g=fixture('brood-laying-blocked');
  g.lifecycle.setNurseSlots(0);
  const q=g.colony.queen,layer=g.world.layers[UNDERGROUND],saved=[];
  for(let y=q.y-3;y<=q.y+3;y++)for(let x=q.x-3;x<=q.x+3;x++) {
    if(x===q.x&&y===q.y)continue;
    if(Math.abs(x-q.x)+Math.abs(y-q.y)>3)continue;
    saved.push([x,y,cellAt(layer,x,y)]);
    writeCell(layer,x,y,TERRAINS.ROCK);
  }
  g.lifecycle.tickCount=LIFE.layInterval;
  const stock=g.foraging.inventory.protein;
  g.lifecycle.layEgg();
  assert.equal(g.lifecycle.brood.length,0);
  assert.equal(g.foraging.inventory.protein,stock);
  for(const [x,y,type] of saved)writeCell(layer,x,y,type);
  g.lifecycle.layEgg();
  assert.equal(g.lifecycle.brood.length,1);
  assert.equal(g.foraging.inventory.protein,stock-1);
});
test('BROOD-08 | no extra food material or population is invented by temporary brood transport',()=>{
  const g=fixture('brood-resource-preservation');
  g.lifecycle.setNurseSlots(2);
  const initial=g.foraging.nodes.reduce((sum,r)=>sum+r.amount,0)+
    Object.values(g.foraging.inventory).reduce((sum,n)=>sum+n,0);
  for(let t=0;t<1050;t++) {
    run(g,1);
    if(t%47!==0)continue;
    const mass=g.foraging.nodes.reduce((sum,r)=>sum+r.amount,0)+
      Object.values(g.foraging.inventory).reduce((sum,n)=>sum+n,0)+
      Object.values(g.lifecycle.consumed).reduce((sum,n)=>sum+n,0)+
      Object.values(g.lifecycle.lost).reduce((sum,n)=>sum+n,0);
    assert.equal(mass,initial);
    assert.ok(g.lifecycle.brood.length<=g.rooms.broodCapacity);
  }
  assert.ok(g.lifecycle.births>0,'brood can still mature without a formal nursery');
});
