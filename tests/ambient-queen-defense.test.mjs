import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { COMBAT } from '../src/core/combat.js';
import { DIRECTIONS, isDiggable, isWalkable, findPath } from '../src/world/navigation.js';
import { SURFACE, UNDERGROUND } from '../src/world/generate.js';

const tick=(g,n=1)=>{for(let i=0;i<n;i++)assert.equal(g.update(100),1)};
const md=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const spot=a=>({x:a.x,y:a.y,layer:a.layer});
function quiet(seed='ambient-queen-regression') {
  const g=new Game(seed);
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);g.combat.setSoldierSlots(0);
  return g;
}
function adjacentQueen(g) {
  const q=g.colony.queen,layer=g.world.layers[UNDERGROUND];
  for(const [dx,dy] of DIRECTIONS){
    const p={x:q.x+dx,y:q.y+dy};
    if(isWalkable(layer,p.x,p.y) && findPath(layer,p,g.world.entrances[0].underground))
      return p;
  }
  throw Error('Queen must have a reachable walkable neighbor');
}
test('IDLE-01 | idle workers stroll on real nest tiles, with cardinal moves and no fake jobs',()=>{
  const g=quiet('ambient-replay-a'),q=g.colony.queen,orig=new Map(g.colony.workers.map(a=>[a.id,spot(a)]));
  let moved=0;
  for(let i=0;i<210;i++){
    const before=new Map(g.colony.workers.map(a=>[a.id,spot(a)]));
    tick(g);
    for(const a of g.colony.workers){
      assert.equal(a.state,'idle');
      assert.equal(a.orderId,null);
      assert.ok(isWalkable(g.world.layers[a.layer],a.x,a.y));
      assert.equal(a.layer,UNDERGROUND);
      assert.ok(md(a,q)<=10,'ambient strolls stay near queen');
      assert.ok(md(a,before.get(a.id))<=1,'no teleport or diagonal ambient movement');
      if(md(a,before.get(a.id)))moved++;
    }
  }
  assert.ok(moved>=8,'ants should be visibly active even without assigned jobs');
  assert.equal(g.colony.orders.size,0);
  assert.equal(g.rooms.queuedCount,0);
  assert.ok(g.colony.workers.some(a=>md(a,orig.get(a.id))>0),'at least one patrol changes a position');
});

test('IDLE-02 | ambient movement is deterministic and a paused game does not advance',()=>{
  const replay=()=>{
    const g=quiet('ambient-repeatable');
    for(let i=0;i<90;i++)tick(g);
    return g.colony.workers.map(a=>[a.id,a.x,a.y,a.motion,a.next?.x,a.next?.y,a.ambientWait]);
  };
  assert.deepEqual(replay(),replay());
  const g=quiet('ambient-paused');
  tick(g,32);
  const before=JSON.stringify(g.colony.workers);
  g.setSpeed(0);
  for(let i=0;i<20;i++)assert.equal(g.update(100),0);
  assert.equal(JSON.stringify(g.colony.workers),before);
});

test('IDLE-03 | real excavation and foraging preempt idle walking',()=>{
  const g=quiet('ambient-preemption');
  tick(g,50);
  const map=g.world.layers[UNDERGROUND];
  let target=null;
  for(let y=2;y<map.height-2&&!target;y++)
    for(let x=2;x<map.width-2&&!target;x++){
      if(!isDiggable(map,x,y))continue;
      if(g.colony.workers.some(a=>DIRECTIONS.some(([dx,dy])=>
        !!findPath(map,a,{x:x+dx,y:y+dy}))))target={x,y};
    }
  assert.ok(target);
  assert.equal(g.colony.queueRectangle(target,target).added,1);
  // Normal mining assignment polls queued jobs every five simulation ticks.
  for(let i=0;i<6&&!g.colony.getOrder(target.x,target.y)?.workerId;i++)tick(g);
  const job=g.colony.getOrder(target.x,target.y);
  assert.ok(job?.workerId,'excavation takes precedence by its next assignment poll');
  const miner=g.colony.workers.find(a=>a.id===job.workerId);
  assert.notEqual(miner.state,'idle');
  assert.equal(miner.ambientActive,false);
  assert.equal(miner.orderId,job.id);
  g.colony.setForageSlots(4);
  // Four foraging slots leave available workers even if one is already mining.
  for(let i=0;i<140 && !g.colony.workers.some(a=>a.state.startsWith('forage-'));i++)tick(g);
  assert.ok(g.colony.workers.some(a=>a.state.startsWith('forage-')));
  assert.ok(g.colony.workers.filter(a=>a.state.startsWith('forage-')).every(a=>!a.ambientActive));
});

test('QUEEN-01 | emergency overrides surface rally, redirects a distant nest defender',()=>{
  const g=quiet('queen-emergency-rally');
  g.combat.setSoldierSlots(1);
  const ant=g.combat.soldiers[0],q=g.colony.queen;
  const entry=g.world.entrances[0],map=g.world.layers[UNDERGROUND];
  // Soldier is stationed inside the nest, farther than the queen's guard ring.
  ant.x=entry.underground.x;ant.y=entry.underground.y;
  g.combat.clearMotion(ant);
  assert.ok(md(ant,q)>1);
  assert.equal(g.combat.setRally(SURFACE,entry.surface.x,entry.surface.y),true);
  const where=adjacentQueen(g);
  const enemy=g.combat.spawn('beetle',UNDERGROUND,where.x,where.y);
  assert.ok(enemy);
  assert.equal(g.combat.queenThreat(),enemy);
  g.combat.soldierTick(ant);
  assert.equal(ant.state,'combat-queen-defense','nest soldier must abandon distant rally');
  assert.ok(ant.next,'soldier starts a real step toward the queen');
  assert.equal(ant.goal,`underground:${enemy.x},${enemy.y}`);
  assert.equal(g.combat.mode,'rally','original rally is deferred, not deleted');
  assert.equal(ant.layer,UNDERGROUND);
  assert.ok(isWalkable(map,ant.next.x,ant.next.y));
  g.combat.enemies.splice(g.combat.enemies.indexOf(enemy),1);
  g.combat.soldierTick(ant);
  assert.equal(ant.state,'combat-rally','normal orders resume after the queen is safe');
});

test('QUEEN-02 | retreat orders and low HP cannot send nest soldiers away during attack',()=>{
  const g=quiet('queen-emergency-retreat');
  g.combat.setSoldierSlots(1);
  const ant=g.combat.soldiers[0],entry=g.world.entrances[0].underground;
  ant.x=entry.x;ant.y=entry.y;g.combat.clearMotion(ant);
  ant.combatHP=1;
  g.combat.setMode('retreat');
  const where=adjacentQueen(g);
  const enemy=g.combat.spawn('raider',UNDERGROUND,where.x,where.y);
  assert.ok(enemy);
  g.combat.soldierTick(ant);
  assert.equal(ant.retreating,false);
  assert.equal(ant.state,'combat-queen-defense');
  assert.ok(ant.next,'must rush to defend instead of resting');
});

test('QUEEN-03 | real queen attack raises priority and defenders can run from elsewhere in nest',()=>{
  const g=quiet('queen-hit-rescue');
  g.combat.setSoldierSlots(1);
  const q=g.colony.queen,where=adjacentQueen(g),entry=g.world.entrances[0].underground;
  for(const a of g.colony.workers){a.x=entry.x;a.y=entry.y;g.combat.clearMotion(a);}
  const enemy=g.combat.spawn('raider',UNDERGROUND,where.x,where.y);
  assert.ok(enemy);
  const hp=g.combat.queenHP;
  g.combat.enemyTick(enemy);
  assert.equal(g.combat.queenHP,hp-2,'enemy must physically hit the queen');
  assert.equal(g.combat.queenThreat(),enemy);
  g.combat.setRally(SURFACE,g.world.entrances[0].surface.x,g.world.entrances[0].surface.y);
  tick(g);
  const defender=g.combat.soldiers[0];
  assert.equal(defender.state,'combat-queen-defense');
  assert.equal(defender.layer,UNDERGROUND);
  assert.ok(defender.next||md(defender,enemy)<=1);
});

test('QUEEN-04 | attacks outside queen range and paused simulation preserve existing commands',()=>{
  const g=quiet('queen-no-false-alarm');
  g.combat.setSoldierSlots(1);
  const q=g.colony.queen,entry=g.world.entrances[0];
  assert.equal(g.combat.setRally(SURFACE,entry.surface.x,entry.surface.y),true);
  const enemy=g.combat.spawn('beetle',SURFACE,entry.surface.x,entry.surface.y);
  assert.ok(enemy);
  assert.equal(g.combat.queenThreat(),null);
  g.combat.soldierTick(g.combat.soldiers[0]);
  assert.notEqual(g.combat.soldiers[0].state,'combat-queen-defense');
  const positions=JSON.stringify(g.colony.workers);
  g.setSpeed(0);
  for(let i=0;i<25;i++)assert.equal(g.update(100),0);
  assert.equal(JSON.stringify(g.colony.workers),positions);
});
