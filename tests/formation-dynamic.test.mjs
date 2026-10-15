import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Game } from '../src/core/game.js';
import { Combat, COMBAT } from '../src/core/combat.js';
import { SURFACE, UNDERGROUND, TERRAINS, createWorld, writeCell } from '../src/world/generate.js';
import { findPath, isWalkable } from '../src/world/navigation.js';

const run=(game,n=1)=>{for(let i=0;i<n;i++)assert.equal(game.update(100),1);};
const key=g=>g&&g.layer+':'+g.x+','+g.y;
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same=(a,b)=>a.x===b.x&&a.y===b.y;
function fixture(size,{width=0,origin=UNDERGROUND}={}){
  const world=createWorld('R2-FORM-SYNTHETIC');
  const center={layer:UNDERGROUND,x:48,y:24};
  const map=world.layers[UNDERGROUND];
  map.cells.fill(TERRAINS.ROCK);
  if(width)for(let x=center.x-Math.floor(width/2);x<=center.x+Math.floor((width-1)/2);x++)
    writeCell(map,x,center.y,TERRAINS.TUNNEL);
  else map.cells.fill(TERRAINS.TUNNEL);
  const workers=Array.from({length:size},(_,i)=>({
    id:'worker-'+(i+1),caste:'worker',profession:'soldier',level:1,combatRole:'soldier',squadId:'A',combatHP:COMBAT.soldierHP,layer:origin,x:origin===UNDERGROUND?center.x:64,
    y:origin===UNDERGROUND?center.y:64,state:'idle',orderId:null,path:[],next:null,motion:0
  }));
  const colony={workers,queen:{...center,alive:true,caste:'queen'},completed:0,isForager:()=>false};
  const combat=new Combat(world,colony,null,null,null);
  combat.setSoldierSlots(size);
  assert.equal(combat.soldiers.length,size);
  assert.equal(combat.setRally(center.layer,center.x,center.y),true);
  return {world,colony,combat,center,workers};
}
function checkUnique(f){
  const goals=f.combat.soldiers.map(s=>f.combat.getRallyGoal(s)).filter(Boolean);
  assert.equal(new Set(goals.map(key)).size,goals.length,'reserved goals cannot alias');
  for(const goal of goals){
    assert.equal(goal.layer,f.center.layer);
    assert.ok(isWalkable(f.world.layers[goal.layer],goal.x,goal.y));
    assert.ok(Math.max(Math.abs(goal.x-f.center.x),Math.abs(goal.y-f.center.y))<=8);
    const route=findPath(f.world.layers[goal.layer],f.center,goal);
    assert.ok(route&&route.length<=12);
  }
  return goals;
}

test('R2-FORM matrix 0/1/2/13/14/50/150 | distinct bounded goals on synthetic accessible terrain',()=>{
  for(const size of [0,1,2,13,14,50,150]){
    const f=fixture(size);
    assert.equal(checkUnique(f).length,size,'all '+size+' must have unique slots');
    assert.equal(f.combat.soldiers.filter(a=>f.combat.getFormationStatus(a)==='Assigned').length,size);
    assert.equal(f.combat.getRallyGoal({id:'foreign',combatRole:'soldier'}),null);
    assert.equal(f.combat.getRallyGoal(f.colony.queen),null);
    assert.equal(f.combat.ralliedCount,size===0?0:1,'only center soldier arrives initially');
  }
});

test('R2-FORM legacy 13 | first thirteen offsets retain old preference ordering',()=>{
  const f=fixture(13);
  const preferred=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]];
  const actual=f.combat.soldiers.map(s=>f.combat.getRallyGoal(s));
  assert.deepEqual(actual,preferred.map(([dx,dy])=>({layer:UNDERGROUND,x:48+dx,y:24+dy})));
});

test('R2-FORM 13/17 corridor | actual finite Standby never overlaps or auto-moves',()=>{
  for(const [capacity,units] of [[13,14],[17,18]]){
    const f=fixture(units,{width:capacity});
    assert.equal(checkUnique(f).length,capacity);
    const waiting=f.combat.soldiers.filter(a=>f.combat.getFormationStatus(a)==='Standby');
    assert.equal(waiting.length,units-capacity);
    assert.ok(waiting.every(a=>f.combat.getRallyGoal(a)===null));
    const target=waiting[0],before={layer:target.layer,x:target.x,y:target.y};
    f.combat.soldierTick(target);
    assert.equal(target.state,'combat-standby');
    assert.deepEqual({layer:target.layer,x:target.x,y:target.y},before);
    assert.equal(target.next,null);
  }
});

test('R2-FORM per-soldier origin | disconnected start is Unreachable despite free slots',()=>{
  const f=fixture(3,{width:0});
  f.world.layers[UNDERGROUND].cells.fill(TERRAINS.ROCK);
  for(const [x,y] of [[48,24],[49,24],[48,25],[49,25],[4,4]])
    writeCell(f.world.layers[UNDERGROUND],x,y,TERRAINS.TUNNEL);
  f.combat.setRally(UNDERGROUND,48,24);
  const isolated=f.combat.soldiers[0];
  isolated.x=4;isolated.y=4;
  f.colony.completed++; // ordinary digging invalidation, unlike raw writeCell
  assert.equal(f.combat.getRallyGoal(isolated),null);
  assert.equal(f.combat.getFormationStatus(isolated),'Unreachable');
  const remaining=f.combat.soldiers.slice(1);
  assert.ok(remaining.every(a=>f.combat.getRallyGoal(a)));
  assert.equal(new Set(remaining.map(a=>key(f.combat.getRallyGoal(a)))).size,2);
});

test('R2-FORM portal | real paired entry required for cross-layer assignment and walking',()=>{
  const game=new Game('audit-surface-rally-15');
  game.colony.setForageSlots(0);game.lifecycle.setNurseSlots(0);
  for(let n=0;n<2;n++)game.lifecycle.promote({profession:'soldier',level:1});
  game.combat.allocate();
  const entry=game.world.entrances[0];
  assert.equal(game.combat.setRally(SURFACE,entry.surface.x+3,entry.surface.y),true);
  assert.ok(game.combat.soldiers.every(a=>game.combat.getRallyGoal(a)?.layer===SURFACE));
  const ant=game.combat.soldiers[0], trace=[];
  for(let i=0;i<140;i++){
    const prev={layer:ant.layer,x:ant.x,y:ant.y};
    run(game);
    trace.push({prev,next:{layer:ant.layer,x:ant.x,y:ant.y}});
    if(ant.layer===SURFACE&&same(ant,game.combat.getRallyGoal(ant)))break;
  }
  assert.ok(trace.some(t=>t.prev.layer!==t.next.layer),'soldier crossed portal');
  for(const t of trace){
    if(t.prev.layer===t.next.layer)assert.ok(dist(t.prev,t.next)<=1);
    else{
      assert.deepEqual({x:t.prev.x,y:t.prev.y},entry[t.prev.layer]);
      assert.deepEqual({x:t.next.x,y:t.next.y},entry[t.next.layer]);
    }
  }
  assert.equal(ant.layer,SURFACE);
});

test('R2-FORM no portal | a physically cut-off source cannot reserve target-layer tile',()=>{
  const f=fixture(1);
  const portal=f.world.entrances[0].surface;
  // Conscript on underground terrain first, then model a soldier stranded on surface.
  f.workers[0].layer=SURFACE;f.workers[0].x=1;f.workers[0].y=1;
  f.world.layers[SURFACE].cells.fill(TERRAINS.STONE);
  writeCell(f.world.layers[SURFACE],1,1,TERRAINS.GRASS);
  writeCell(f.world.layers[SURFACE],portal.x,portal.y,TERRAINS.ENTRANCE);
  f.colony.completed++;
  assert.equal(f.combat.getRallyGoal(f.workers[0]),null);
  assert.equal(f.combat.getFormationStatus(f.workers[0]),'Unreachable');
});

test('R2-FORM stability | permanent soldiers reject reassignment; death clears reservation',()=>{
  const f=fixture(8);
  const retained=new Map(f.combat.soldiers.map(a=>[a,f.combat.getRallyGoal(a)]));
  const removed=f.combat.soldiers[2];
  assert.equal(f.combat.demobilize(removed),false,'soldier caste must be permanent');
  assert.equal(f.combat.recruit(removed),false,'already-enlisted soldier cannot be recruited twice');
  for(const [ant,goal] of retained)assert.deepEqual(f.combat.getRallyGoal(ant),goal);
  const dead=f.combat.soldiers[4];
  f.colony.workers.splice(f.colony.workers.indexOf(dead),1);
  assert.equal(f.combat.getRallyGoal(dead),null);
  checkUnique(f);
  for(const [ant,goal] of retained)if(ant!==dead)
    assert.deepEqual(f.combat.getRallyGoal(ant),goal);
});

test('R2-FORM rally commands | same center clears motion but keeps slots; invalid center atomic',()=>{
  const f=fixture(5),a=f.combat.soldiers[0];
  const goals=f.combat.soldiers.map(ant=>f.combat.getRallyGoal(ant));
  a.next={x:a.x+1,y:a.y};a.path=[a.next];a.motion=.3;
  assert.equal(f.combat.setRally(UNDERGROUND,f.center.x,f.center.y),true);
  assert.equal(a.next,null);assert.deepEqual(a.path,[]);assert.equal(a.motion,0);
  assert.deepEqual(f.combat.soldiers.map(ant=>f.combat.getRallyGoal(ant)),goals);
  a.next={x:a.x+1,y:a.y};a.motion=.3;
  assert.equal(f.combat.setRally(UNDERGROUND,-1,0),false);
  assert.deepEqual(f.combat.rally,f.center);
  assert.ok(a.next);assert.equal(a.motion,.3);
  assert.equal(f.combat.setRally(UNDERGROUND,f.center.x+1,f.center.y),true);
  assert.equal(a.next,null);
  checkUnique({...f,center:{...f.center,x:f.center.x+1}});
});

test('R2-FORM active arrival | non-rally and intercept/retreat/attack states do not count',()=>{
  const f=fixture(2),soldiers=f.combat.soldiers;
  const center=soldiers.find(a=>same(a,f.center));
  assert.equal(f.combat.ralliedCount,1);
  f.combat.setMode('defend');assert.equal(f.combat.ralliedCount,0);
  f.combat.setMode('rally');assert.equal(f.combat.ralliedCount,1);
  for(const state of ['combat-intercept','combat-attack','combat-retreat']){
    center.state=state;assert.equal(f.combat.ralliedCount,0);
  }
  center.state='combat-rally';center.next={x:49,y:24};
  assert.equal(f.combat.ralliedCount,0);
  center.next=null;center.combatHP=2;assert.equal(f.combat.ralliedCount,0);
});

test('R2-FORM priority | rally cannot bypass nearby attack or wounded retreat',()=>{
  const g=new Game('r2-priority');
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
  g.lifecycle.promote({profession:'soldier',level:1});g.combat.allocate();
  const ant=g.combat.soldiers[0],q=g.colony.queen;
  assert.equal(g.combat.setRally(UNDERGROUND,q.x,q.y),true);
  const enemy=g.combat.spawn('beetle',UNDERGROUND,ant.x,ant.y);
  assert.ok(enemy);
  g.combat.soldierTick(ant);
  assert.ok(['combat-attack','combat-intercept'].includes(ant.state));
  const hp=enemy.hp;
  assert.ok(hp<COMBAT.soldierHP+10);
  ant.combatHP=1;
  g.combat.soldierTick(ant);
  assert.equal(ant.state,'combat-retreat');
  assert.equal(ant.retreating,true);
  assert.equal(g.combat.ralliedCount,0);
});

test('R2-FORM 1000 reads | cached plan identity stable, dig revision refreshes',()=>{
  const f=fixture(150);
  const plan=f.combat._formation;
  const slots=plan.slots,connectivity=plan.centerReach;
  for(let i=0;i<1000;i++){
    assert.ok(f.combat.getRallyGoal(f.workers[i%f.workers.length]));
    assert.strictEqual(f.combat._formation,plan,'unchanged getter must not rebuild/BFS');
  }
  assert.strictEqual(f.combat._formation.slots,slots);
  assert.strictEqual(f.combat._formation.centerReach,connectivity);
  f.colony.completed++;
  assert.ok(f.combat.getRallyGoal(f.workers[0]));
  assert.notStrictEqual(f.combat._formation,plan);
  assert.equal(f.combat._formation.completed,f.colony.completed);
});

test('R2-FORM ordered replay | matching seed and event order produces identical mapping',()=>{
  const replay=()=>{
    const f=fixture(17);
    assert.equal(f.combat.demobilize(f.workers[3]),false);
    assert.equal(f.combat.recruit(f.workers[3]),false);
    f.colony.completed++;
    f.combat.getRallyGoal(f.workers[0]);
    f.combat.setRally(UNDERGROUND,49,24);
    return f.combat.soldiers.map(a=>[a.id,key(f.combat.getRallyGoal(a)),f.combat.getFormationStatus(a)]);
  };
  assert.deepEqual(replay(),replay());
});

test('R2-FORM pause | no formation progress occurs while Game clock is stopped',()=>{
  const g=new Game('r2-pause');
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
  const q=g.colony.queen;
  g.lifecycle.promote({profession:'soldier',level:1});g.combat.allocate();
  assert.equal(g.combat.setRally(UNDERGROUND,q.x+3,q.y),true);
  const before=JSON.stringify({soldiers:g.combat.soldiers,tick:g.combat.tickCount,
    goals:g.combat.soldiers.map(a=>g.combat.getRallyGoal(a)),rallied:g.combat.ralliedCount});
  g.setSpeed(0);
  for(let i=0;i<25;i++)assert.equal(g.update(100),0);
  assert.equal(JSON.stringify({soldiers:g.combat.soldiers,tick:g.combat.tickCount,
    goals:g.combat.soldiers.map(a=>g.combat.getRallyGoal(a)),rallied:g.combat.ralliedCount}),before);
});

test('R2-FORM build gate | static site builds even if independent PATH-01 test is red',()=>{
  // The existing CI workflow skips its later build step after unrelated PATH-01.
  // Run the exact build command independently and expose its actual process exit.
  const result=spawnSync('npm',['run','build'],{cwd:process.cwd(),encoding:'utf8',timeout:60000});
  console.log('R2_BUILD_PROOF command="npm run build" exit='+String(result.status)+
    ' signal='+String(result.signal));
  assert.equal(result.status,0,
    'npm run build failed\n'+(result.stdout||'')+'\n'+(result.stderr||''));
  assert.match(result.stdout,/Built static website in dist/);
});
