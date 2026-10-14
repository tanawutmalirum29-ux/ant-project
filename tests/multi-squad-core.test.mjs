import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Combat, COMBAT } from '../src/core/combat.js';
import { createWorld, SURFACE, UNDERGROUND, TERRAINS, writeCell } from '../src/world/generate.js';
import { findPath, isWalkable } from '../src/world/navigation.js';

const ok = response => { assert.equal(response.ok,true,JSON.stringify(response));return response.data; };
const step = (game,n=1) => {for(let i=0;i<n;i++)assert.equal(game.update(100),1);};
const pos = ant => ({layer:ant.layer,x:ant.x,y:ant.y});
const coord = goal => goal&&goal.layer+':'+goal.x+','+goal.y;
function game(seed='squad-core-suite'){
  const g=new Game(seed);
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);g.combat.setSoldierSlots(3);
  assert.equal(g.combat.soldiers.length,3);
  return g;
}
function checkSnapshot(g){
  const both=ok(g.combat.getSquads());
  assert.deepEqual(both.map(s=>s.id),['A','B']);
  assert.equal(both[0].count+both[1].count,g.combat.soldiers.length);
  const ids=both.flatMap(s=>s.soldiers.map(a=>a.id));
  assert.equal(new Set(ids).size,ids.length);
  return both;
}
test('SQUAD-01: initial roster A, empty B, default recruits, typed snapshots',()=>{
  const g=game();const [a,b]=checkSnapshot(g);
  assert.equal(a.count,3);assert.equal(b.count,0);assert.equal(a.mode,'defend');
  assert.equal(a.hpCurrent,3*COMBAT.soldierHP);assert.equal(a.hpMax,a.hpCurrent);
  assert.deepEqual(a.formation,{assigned:0,standby:0,unreachable:0});
  a.soldiers[0].hp=999;a.soldiers[0].x=-10;a.rally={layer:SURFACE,x:-1,y:-1};
  assert.equal(ok(g.combat.getSquad('A')).soldiers[0].hp,COMBAT.soldierHP);
  assert.equal(ok(g.combat.getSquad('A')).soldiers[0].x,g.combat.soldiers[0].x);
  assert.equal(g.combat.rally,null);
  assert.equal(g.combat.soldiers.every(ant=>ant.squadId==='A'),true);
});
test('SQUAD-02: two-way transfer preserves object, ID, HP, cooldown, quota, population',()=>{
  const g=game(),c=g.combat,ant=c.soldiers[0];ant.combatHP=5;ant.combatCooldown=3;
  const before={count:g.colony.workers.length,quota:c.soldierSlots,pop:g.population,soldiers:c.soldiers.length};
  assert.deepEqual(ok(c.transferSoldier(ant.id,'B')),{soldierId:ant.id,fromSquad:'A',toSquad:'B'});
  assert.strictEqual(c.soldiers.find(a=>a.id===ant.id),ant);
  assert.equal(ant.combatHP,5);assert.equal(ant.combatCooldown,3);
  assert.equal(ok(c.getSquad('B')).count,1);
  assert.deepEqual(ok(c.transferSoldier(ant.id,'A')),{soldierId:ant.id,fromSquad:'B',toSquad:'A'});
  assert.equal(ant.combatHP,5);
  assert.deepEqual({count:g.colony.workers.length,quota:c.soldierSlots,pop:g.population,soldiers:c.soldiers.length},before);
  checkSnapshot(g);
});
test('SQUAD-03: invalid commands reject atomically; foreign and demobilized ants never transfer',()=>{
  const g=game(),c=g.combat,ant=c.soldiers[0];
  const snapshot=()=>JSON.stringify({a:c.getSquads(),soldiers:c.soldiers,quota:c.soldierSlots,event:c.lastEvent});
  const initial=snapshot();
  const reject=(res,code)=>{assert.equal(res.ok,false);assert.equal(res.error.code,code);assert.ok(res.error.message);assert.equal(snapshot(),initial);};
  reject(c.getSquad('C'),'INVALID_SQUAD');
  reject(c.transferSoldier(ant.id,'C'),'INVALID_SQUAD');
  reject(c.transferSoldier('', 'B'),'INVALID_SOLDIER');
  reject(c.transferSoldier('worker-unknown','B'),'NOT_ACTIVE_SOLDIER');
  reject(c.transferSoldier(ant.id,'A'),'SAME_SQUAD');
  reject(c.setSquadMode('C','rally'),'INVALID_SQUAD');
  reject(c.setSquadMode('B','charge'),'INVALID_ORDER');
  reject(c.setSquadRally('B','sky',2,3),'INVALID_RALLY');
  reject(c.setSquadRally('B',UNDERGROUND,1.2,5),'INVALID_RALLY');
  reject(c.setSquadRally('B',UNDERGROUND,-2,1),'INVALID_RALLY');
  assert.equal(c.demobilize(ant),true);
  assert.equal(c.transferSoldier(ant.id,'B').error.code,'NOT_ACTIVE_SOLDIER');
});
test('SQUAD-04: each squad owns its mode, rally and distinct formation reservations',()=>{
  const g=game(),c=g.combat,queen=g.colony.queen,ids=c.soldiers.map(a=>a.id);
  ok(c.transferSoldier(ids[2],'B'));
  ok(c.setSquadRally('A',UNDERGROUND,queen.x,queen.y));
  ok(c.setSquadRally('B',SURFACE,64,64));
  const [a,b]=checkSnapshot(g);
  assert.equal(a.mode,'rally');assert.equal(b.mode,'rally');
  assert.equal(a.rally.layer,UNDERGROUND);assert.equal(b.rally.layer,SURFACE);
  for(const id of ['A','B']){
    const group=c.soldiers.filter(ant=>ant.squadId===id);
    const goals=group.map(ant=>c.getRallyGoal(ant)).filter(Boolean);
    assert.equal(new Set(goals.map(coord)).size,goals.length);
    assert.equal(ok(c.getSquad(id)).formation.assigned,goals.length);
  }
  ok(c.setSquadMode('B','retreat'));
  assert.equal(c.mode,'rally');assert.equal(c.rally.layer,UNDERGROUND);
  assert.equal(ok(c.getSquad('B')).rally.layer,SURFACE);
  assert.equal(c.getSquad('B').data.mode,'retreat');
  assert.equal(c.ralliedCount,ok(c.getSquad('A')).ralliedCount);
});
test('SQUAD-05: disconnected rally rejection preserves motion and standing orders',()=>{
  const g=game(),c=g.combat,ant=c.soldiers[0];
  ok(c.transferSoldier(ant.id,'B'));
  const queen=g.colony.queen;
  ok(c.setSquadRally('B',UNDERGROUND,queen.x,queen.y));
  ant.next={x:ant.x+1,y:ant.y};ant.path=[ant.next];ant.motion=.25;
  writeCell(g.world.layers[UNDERGROUND],1,1,TERRAINS.TUNNEL);
  const before={state:JSON.stringify(c.getSquads()),path:JSON.stringify(ant.path),next:JSON.stringify(ant.next),motion:ant.motion,event:c.lastEvent};
  const result=c.setSquadRally('B',UNDERGROUND,1,1);
  assert.equal(result.ok,false);assert.equal(result.error.code,'UNREACHABLE_RALLY');
  assert.deepEqual({state:JSON.stringify(c.getSquads()),path:JSON.stringify(ant.path),next:JSON.stringify(ant.next),motion:ant.motion,event:c.lastEvent},before);
});
test('SQUAD-06: mid-route transfer cancels obsolete non-emergency motion; real portal',()=>{
  const g=game('squad-portal'),c=g.combat,entry=g.world.entrances[0];
  const ant=c.soldiers[0];
  ok(c.setSquadRally('A',SURFACE,entry.surface.x+3,entry.surface.y));
  step(g,3);assert.ok(ant.next||ant.path.length);
  ok(c.transferSoldier(ant.id,'B'));
  assert.equal(ant.next,null);assert.deepEqual(ant.path,[]);assert.equal(ant.motion,0);
  ok(c.setSquadRally('B',SURFACE,entry.surface.x+4,entry.surface.y));
  let crossing=0;let arrived=false;
  for(let i=0;i<170;i++){
    const before=pos(ant);step(g);
    const after=pos(ant);
    if(before.layer!==after.layer){
      crossing++;
      assert.deepEqual({x:before.x,y:before.y},entry[before.layer]);
      assert.deepEqual({x:after.x,y:after.y},entry[after.layer]);
    }else assert.ok(Math.abs(before.x-after.x)+Math.abs(before.y-after.y)<=1);
    if(ant.layer===SURFACE&&c.getRallyGoal(ant)&&ant.x===c.getRallyGoal(ant).x&&ant.y===c.getRallyGoal(ant).y){arrived=true;break;}
  }
  assert.equal(arrived,true);assert.ok(crossing>=1);
  assert.ok(c.portalCrossings>=1);
});
test('SQUAD-07: queen attack globally overrides both squad modes and retains orders',()=>{
  const g=game('squad-queen'),c=g.combat,queen=g.colony.queen,entry=g.world.entrances[0];
  const first=c.soldiers[0],second=c.soldiers[1];
  ok(c.transferSoldier(second.id,'B'));
  ok(c.setSquadRally('A',SURFACE,entry.surface.x+2,entry.surface.y));
  ok(c.setSquadMode('B','retreat'));
  first.layer=SURFACE;first.x=entry.surface.x;first.y=entry.surface.y;c.clearMotion(first);
  second.x=entry.underground.x;second.y=entry.underground.y;c.clearMotion(second);
  const point={x:queen.x,y:queen.y-1};
  assert.ok(isWalkable(g.world.layers[UNDERGROUND],point.x,point.y));
  const enemy=c.spawn('raider',UNDERGROUND,point.x,point.y);assert.ok(enemy);
  assert.equal(c.queenThreat(),enemy);
  const bRoute=pos(first);
  c.soldierTick(first);c.soldierTick(second);
  assert.equal(first.state,'combat-queen-defense');
  assert.equal(second.state,'combat-queen-defense');
  assert.equal(c.getSquad('A').data.queenEmergency,true);
  assert.equal(c.getSquad('B').data.queenEmergency,true);
  assert.equal(c.mode,'rally');assert.equal(ok(c.getSquad('B')).mode,'retreat');
  assert.equal(first.layer,bRoute.layer);
  c.enemies.splice(c.enemies.indexOf(enemy),1);
  c.soldierTick(first);c.soldierTick(second);
  assert.equal(first.state,'combat-rally');assert.equal(second.state,'combat-retreat');
});
test('SQUAD-08: transfer during queen emergency does not abort interception',()=>{
  const g=game('transfer-emergency'),c=g.combat,q=g.colony.queen,ant=c.soldiers[0];
  const enemy=c.spawn('raider',UNDERGROUND,q.x,q.y-1);assert.ok(enemy);
  c.soldierTick(ant);
  const before={next:ant.next,path:ant.path,motion:ant.motion,goal:ant.goal};
  ok(c.transferSoldier(ant.id,'B'));
  assert.deepEqual({next:ant.next,path:ant.path,motion:ant.motion,goal:ant.goal},before);
  assert.equal(c.getSquad('B').data.count,1);
});
test('SQUAD-09: roster death/downsize removes ghosts; former injured soldier keeps HP',()=>{
  const g=game('squad-casualties'),c=g.combat,ant=c.soldiers[0];
  ok(c.transferSoldier(ant.id,'B'));ant.combatHP=4;
  assert.equal(c.demobilize(ant),true);assert.equal(ant.combatHP,4);
  assert.equal(ok(c.getSquad('B')).count,0);
  assert.equal(c.recruit(ant),true);assert.equal(ant.squadId,'A');assert.equal(ant.combatHP,4);
  ok(c.transferSoldier(ant.id,'B'));
  g.lifecycle.killWorker(ant);
  assert.equal(ok(c.getSquad('B')).count,0);
  assert.equal(c.transferSoldier(ant.id,'A').error.code,'NOT_ACTIVE_SOLDIER');
  checkSnapshot(g);
  c.setSoldierSlots(0);
  assert.equal(c.soldiers.length,0);assert.equal(ok(c.getSquad('B')).count,0);
});
test('SQUAD-10: deterministic order and transfer replay with pause semantics',()=>{
  const simulate=()=>{
    const g=game('squad-repeat'),c=g.combat,entry=g.world.entrances[0];
    ok(c.transferSoldier(c.soldiers[1].id,'B'));
    ok(c.setSquadRally('A',UNDERGROUND,g.colony.queen.x+3,g.colony.queen.y));
    ok(c.setSquadRally('B',SURFACE,entry.surface.x+2,entry.surface.y));
    step(g,20);
    const before=JSON.stringify({groups:c.getSquads(),workers:g.colony.workers,ticks:c.tickCount});
    g.setSpeed(0);
    for(let i=0;i<20;i++)assert.equal(g.update(100),0);
    assert.equal(JSON.stringify({groups:c.getSquads(),workers:g.colony.workers,ticks:c.tickCount}),before);
    return before;
  };
  assert.equal(simulate(),simulate());
});
test('SQUAD-11: direct Combat fixture keeps all-A legacy public behavior',()=>{
  const world=createWorld('squad-legacy-core');
  const q={x:48,y:24,layer:UNDERGROUND,alive:true,caste:'queen'};
  const ants=[1,2,3].map(i=>({id:'worker-'+i,x:48,y:24+i,layer:UNDERGROUND,
    state:'idle',orderId:null,path:[],next:null,motion:0}));
  const colony={workers:ants,queen:q,completed:0,isForager:()=>false};
  const c=new Combat(world,colony,null,null,null);c.setSoldierSlots(3);
  assert.equal(c.setMode('defend'),'defend');
  assert.throws(()=>c.setMode('charge'),RangeError);
  assert.equal(c.setRally(UNDERGROUND,q.x,q.y),true);
  assert.equal(c.mode,'rally');
  assert.equal(c.soldiers.length,3);
  assert.equal(ok(c.getSquad('A')).count,3);
  assert.equal(ok(c.getSquad('B')).count,0);
});
