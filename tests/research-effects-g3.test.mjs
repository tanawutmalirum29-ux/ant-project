import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { TICK_MS } from '../src/core/time.js';
import { UNDERGROUND, TERRAINS, cellAt, writeCell } from '../src/world/generate.js';

const TYPES=['carbs','protein','water'];
const step=(g,n=1)=>{for(let i=0;i<n;i++)g.update(TICK_MS);};
const stock=(g,type)=>g.rooms.rooms.reduce((sum,r)=>sum+(r.stock?.[type]||0),0);
const debts=(g,room,type)=>g.rooms.refundableForSource(room.id,type);
const invariants=(g,stepName='')=>{
  for(const type of TYPES){
    assert.equal(stock(g,type),g.foraging.inventory[type],stepName+': aggregate '+type);
    for(const room of g.rooms.rooms){
      if(room.type==='queen'||room.type==='food_store'||room.type==='water_store'){
        const left=(room.stock?.[type]||0)+debts(g,room,type);
        const cap=g.rooms.effectiveRoomCap(room,type);
        assert.ok(left>=0&&left<=cap,stepName+': '+room.id+'/'+type+' stock+debt='+left+' cap='+cap);
      }
    }
    assert.ok(g.foraging.nodes.every(n=>n.reserved>=0&&n.reserved<=n.amount),stepName+': physical claims');
  }
};
const physicalMass=(g,type)=>{
  const nodes=g.foraging.nodes.filter(n=>n.type===type).reduce((n,p)=>n+p.amount,0);
  const cargo=g.colony.workers.reduce((n,a)=>n+(a.cargo?.type===type?a.cargo.amount:0),0);
  return nodes+cargo+stock(g,type)+g.rooms.held[type]+g.rooms.spent[type]+
    g.lifecycle.heldEgg[type]+g.lifecycle.eggSpent[type]+g.lifecycle.consumed[type]+
    g.lifecycle.lost[type]+g.research.held[type]+g.research.spent[type]-
    g.ecology.regenerated[type];
};
const massSnap=g=>Object.fromEntries(TYPES.map(t=>[t,physicalMass(g,t)]));
const setDepot=(g,room,values)=>{
  // EXPLICIT TEST FIXTURE: physically inject/withdraw stored material at a real
  // room and mirror the aggregate. Not natural field gathering; mass baseline
  // is taken AFTER this disclosed operation and before live simulation starts.
  for(const type of TYPES){
    const wanted=values[type]??0;
    assert.ok(Number.isSafeInteger(wanted)&&wanted>=0&&wanted<=g.rooms.effectiveRoomCap(room,type));
    const delta=wanted-(room.stock[type]||0);
    room.stock[type]=wanted;g.foraging.inventory[type]+=delta;
  }
};
const findSite=(g,type)=>{
  const q=g.colony.queen;
  for(let radius=2;radius<=15;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const x=q.x+dx,y=q.y+dy;
    if(g.rooms.validate(type,x,y).ok)return {x,y};
  }
  throw new Error('No physical connected 2x2 '+type+' site; seed='+g.world.seedLabel);
};
const construct=(g,type)=>{
  const p=findSite(g,type),out=g.rooms.queue(type,p.x,p.y);
  assert.equal(out.ok,true,type);
  for(let n=0;n<700&&out.room.status!=='ready';n++)step(g);
  assert.equal(out.room.status,'ready',type+' physically built, with actual builder routes');
  return out.room;
};
const setup=()=>{
  const g=new Game('CP-B-G3-PHYSICAL');
  g.pauseOnDefeat=true;
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
  Object.assign(g.foraging.inventory,{carbs:23,protein:23,water:23});g.rooms.syncInventory();
  const store=construct(g,'food_store'),nursery=construct(g,'nursery');
  assert.equal(store.connected,true);assert.equal(nursery.connected,true);
  setDepot(g,g.rooms.rooms[0],{carbs:7,protein:10,water:12});
  setDepot(g,store,{carbs:16,protein:16,water:0});
  invariants(g,'funded physical source rooms');
  return {g,store,nursery};
};
const onFootprint=(g,ant)=>g.rooms.rooms.some(r=>r.status==='ready'&&r.connected&&
  g.rooms.footprint(r).some(p=>p.x===ant.x&&p.y===ant.y));
const finishTrip=({g,store,nursery},cancelOrder)=>{
  // Real foraging: first let a regular forager reach a real field node, gather,
  // travel the SURFACE path back and cross into the UNDERGROUND layer.
  // We only enqueue competing liabilities AFTER observing real inbound cargo.
  g.colony.setForageSlots(1);
  const baseline=g.foraging.delivered;
  let carrier=null;
  for(let n=0;n<1700;n++){
    step(g);
    carrier=g.colony.workers.find(a=>a.layer===UNDERGROUND&&a.cargo?.amount>0&&
      a.state==='forage-return-underground');
    if(carrier)break;
  }
  assert.ok(carrier,'actual field gathering + return portal crossed without teleport/test cargo');
  const incoming={...carrier.cargo},before=massSnap(g);
  g.colony.setForageSlots(0);
  const build=g.rooms.queue('rest',findSite(g,'rest').x,findSite(g,'rest').y);
  assert.equal(build.ok,true);
  const egg=g.lifecycle.queueEgg(nursery.id,'miner',1);
  assert.equal(egg.ok,true);
  assert.equal(egg.order.status,'QUEUED');
  const research=g.research.start('foraging_routes');
  assert.equal(research.ok,true);
  const pickups=g.research.snapshot().active.pickups;
  assert.ok(new Set(pickups.map(p=>p.sourceRoomId)).size>=2,
    'real Research purchase must debit multiple physical depots');
  assert.equal(build.room.status,'planned');
  const threeClaims=()=>invariants(g,'simultaneous egg/build/research');
  threeClaims();
  for(let n=0;n<150&&g.foraging.delivered===baseline;n++){
    step(g);invariants(g,'incoming real forage cargo tick '+n);
  }
  assert.ok(g.foraging.delivered>baseline,'actual cargo must deposit through real route');
  assert.equal(carrier.cargo,null);
  assert.ok(onFootprint(g,carrier),'cargo deposited at real ready connected depot');
  assert.deepEqual(massSnap(g),before,'all three resource masses conserved through live delivery');

  // A real refundable source (food store) may become topologically unavailable;
  // its claims remain protected and can be refunded at the same original depot.
  const map=g.world.layers[UNDERGROUND],x=store.x,y=store.y;
  const original=cellAt(map,x,y);
  writeCell(map,x,y,TERRAINS.ROCK);g.rooms.updateConnectivity();
  assert.equal(store.status,'disabled');
  assert.equal(g.rooms.storageSlots('carbs').some(v=>v.room.id===store.id),false);
  invariants(g,'disconnected store');
  writeCell(map,x,y,original);g.rooms.updateConnectivity();
  assert.equal(store.status,'ready');
  const actions=cancelOrder==='research-first'
    ? [()=>g.research.cancel(research.runId).ok,
      ()=>g.lifecycle.cancelEgg(egg.order.id),()=>g.rooms.cancel(build.room.id)]
    : [()=>g.rooms.cancel(build.room.id),()=>g.lifecycle.cancelEgg(egg.order.id),
      ()=>g.research.cancel(research.runId).ok];
  // The egg normally remains queued: starts after return-portal, not at birth.
  for(const action of actions){
    assert.equal(action(),true,'refund each real original-source claim once');
    invariants(g,'refunded action');
  }
  assert.equal(g.research.held.carbs,0);
  assert.deepEqual(massSnap(g),before);
  return {incoming,ticks:g.clock.ticks,pickups,delivered:g.foraging.delivered-baseline};
};

test('CP-B-G3-01 real Game: multi-depot real Nursery/build/Research liabilities and routed inbound field cargo; cancellation order A',()=>{
  const result=finishTrip(setup(),'research-first');
  assert.ok(result.incoming.amount>=1);
});

test('CP-B-G3-02 real Game: reverse original-source refund order; conservation and rerun reproducibility',()=>{
  const a=finishTrip(setup(),'build-first'),b=finishTrip(setup(),'build-first');
  assert.deepEqual(a,b,'same seed, real physics, consumption and research outcomes deterministic');
});

test('CP-B-G3-03 actual connected source shrink/deletion refuses exact research cancellation atomically',()=>{
  const {g,store}=setup();
  const out=g.research.start('foraging_routes');
  assert.equal(out.ok,true);
  const take=g.research.snapshot().active.pickups.find(p=>p.sourceRoomId===store.id);
  assert.ok(take,'multi-source research fixture uses the built food store');
  const snapshot=()=>JSON.stringify({stock:g.rooms.rooms.map(r=>({id:r.id,stock:{...r.stock}})),
    inventory:{...g.foraging.inventory},held:g.research.held,active:g.research.snapshot().active});
  const previousCap=store.capacity.carbs;
  store.capacity.carbs=0; // EXPLICIT FAULT INJECTION: impossible source capacity shrink
  const before=snapshot();
  assert.equal(g.research.cancel(out.runId).error.code,'REFUND_SOURCE_UNAVAILABLE');
  assert.equal(snapshot(),before,'no mutation on missing storage capacity');
  store.capacity.carbs=previousCap;
  // EXPLICIT FAULT INJECTION: original built depot disappears, not natural demolition
  g.rooms.rooms.splice(g.rooms.rooms.indexOf(store),1);
  const absent=snapshot();
  assert.equal(g.research.cancel(out.runId).error.code,'REFUND_SOURCE_UNAVAILABLE');
  assert.equal(snapshot(),absent);
  g.rooms.rooms.push(store);
  assert.equal(g.research.cancel(out.runId).ok,true);
  invariants(g,'restored source refunded');
});

test('CP-B-G3-04 actual wired Game Research completion modifies future physical trip only',()=>{
  const g=new Game('CP-B-G3-LIVE-FORAGE');
  g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
  Object.assign(g.foraging.inventory,{carbs:12,protein:10,water:10});g.rooms.syncInventory();
  const worker=g.colony.workers[0];
  worker.profession='forager';worker.level=5;
  assert.equal(g.foraging.carryCapacityFor(worker),5);
  const out=g.research.start('foraging_routes');assert.equal(out.ok,true);
  for(let n=0;n<599;n++)step(g);
  assert.equal(g.research.hasCompleted('foraging_routes'),false);
  assert.equal(g.foraging.carryCapacityFor(worker),5);
  step(g);
  assert.equal(g.research.hasCompleted('foraging_routes'),true);
  assert.equal(g.foraging.carryCapacityFor(worker),6);
  assert.equal(g.research.held.carbs,0);
  assert.equal(g.research.spent.carbs,6);
  assert.equal(g.research.start('foraging_routes').error.code,'ALREADY_RESEARCHED');
});
