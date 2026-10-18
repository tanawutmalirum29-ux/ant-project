import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { LIFE } from '../src/core/lifecycle.js';

const advance=(game,ticks)=>{for(let i=0;i<ticks;i++)game.update(100);};
function nursery(game,id='nursery-a',width=2,height=2) {
  const q=game.colony.queen;
  const room={id,type:'nursery',x:q.x-4,y:q.y,width,height,status:'ready',connected:true,
    progress:65,ticks:65,workerId:null,broodSlots:width*height,
    cost:{carbs:3,protein:2},capacity:{},stock:{carbs:0,protein:0,water:0}};
  game.rooms.rooms.push(room);
  game.rooms.updateConnectivity();
  assert.equal(room.status,'ready');
  return room;
}
function fixture(stock=20){
  const g=new Game('newborn');
  g.colony.setForageSlots(0);
  Object.assign(g.foraging.inventory,{carbs:stock,protein:stock,water:stock});
  g.rooms.syncInventory();
  return {g,room:nursery(g)};
}
function heldMass(g,type){
  return g.foraging.inventory[type]+g.lifecycle.heldEgg[type]+g.lifecycle.eggSpent[type];
}
test('repeat default, validation, immutable snapshots, opt-in is paid only on fixed tick',()=>{
  const {g,room}=fixture();
  const core=g.lifecycle;
  assert.equal(core.getRepeatOrder(room.id).plan.state,'disabled');
  assert.equal(core.setRepeatOrder('absent','miner',1,true).reason,'invalid-room');
  assert.equal(core.setRepeatOrder(room.id,'invalid',1,true).reason,'invalid-choice');
  assert.equal(core.setRepeatOrder(room.id,'miner',6,true).reason,'invalid-choice');
  assert.equal(core.getRepeatOrder(room.id).plan.state,'disabled');
  const before={carbs:heldMass(g,'carbs'),protein:heldMass(g,'protein')};
  const plan=core.setRepeatOrder(room.id,'nurse',2,true);
  assert.equal(plan.plan.state,'armed');
  assert.equal(core.eggOrders.length,0);
  assert.deepEqual(before,{carbs:heldMass(g,'carbs'),protein:heldMass(g,'protein')});
  const manual=core.queueEgg(room.id,'miner',1);
  assert.ok(manual.ok,'user request is serviced before fixed-tick auto order');
  advance(g,1);
  assert.equal(core.eggOrders.length,2);
  assert.equal(core.getRepeatOrder(room.id).plan.state,'waiting');
  assert.equal(core.eggOrders[0].id,manual.order.id);
  assert.equal(core.eggOrders[1].profession,'nurse');
  assert.equal(core.eggOrders[1].level,2);
  assert.deepEqual(before,{carbs:heldMass(g,'carbs'),protein:heldMass(g,'protein')});
  assert.ok(Object.isFrozen(core.getRepeatOrder(room.id).plan));
  assert.equal(core.heldEgg.carbs,3);
  assert.equal(core.heldEgg.protein,5);
  advance(g,10);
  assert.equal(core.eggOrders.length,2,'no duplicate auto orders while one is outstanding');
});

test('disable only prevents next cycles, queued cancel refunds original sources once and pauses',()=>{
  const {g,room}=fixture();
  const core=g.lifecycle;
  const queen=g.rooms.rooms[0];
  queen.stock.carbs=1;queen.stock.protein=1;
  const depot={id:'source-food',type:'food_store',x:queen.x,y:queen.y,width:1,height:1,
    status:'ready',connected:true,capacity:{carbs:30,protein:30,water:0},
    stock:{carbs:7,protein:7,water:0}};
  g.rooms.rooms.push(depot);
  g.foraging.inventory.carbs=8;g.foraging.inventory.protein=8;
  const before={queen:{...queen.stock},depot:{...depot.stock}};
  const mass={carbs:heldMass(g,'carbs'),protein:heldMass(g,'protein')};
  core.setRepeatOrder(room.id,'soldier',2,true);
  core.tickRepeatOrders();
  const id=core.getRepeatOrder(room.id).plan.activeOrderId;
  const order=core.eggOrders.find(o=>o.id===id);
  assert.deepEqual(order.pickups.map(p=>p.sourceRoomId),['room-queen','source-food','room-queen','source-food']);
  core.setRepeatOrder(room.id,'soldier',2,false);
  assert.equal(core.getRepeatOrder(room.id).plan.state,'disabled');
  assert.ok(core.eggOrders.some(o=>o.id===id),'turning off does not refund a paid egg');
  core.setRepeatOrder(room.id,'soldier',2,true);
  assert.equal(core.getRepeatOrder(room.id).plan.activeOrderId,id,'resuming preserves paid order');
  assert.equal(core.cancelEgg(id),true);
  assert.equal(core.cancelEgg(id),false,'cancel idempotency');
  assert.equal(core.getRepeatOrder(room.id).plan.stopReason,'manual-cancel');
  assert.equal(core.getRepeatOrder(room.id).plan.state,'paused');
  assert.deepEqual(queen.stock,before.queen);
  assert.deepEqual(depot.stock,before.depot);
  assert.deepEqual(mass,{carbs:heldMass(g,'carbs'),protein:heldMass(g,'protein')});
  core.tickRepeatOrders();
  assert.equal(core.eggOrders.length,0,'manual cancellation must not immediately rebuy');
  core.setRepeatOrder(room.id,'miner',1,true);
  core.tickRepeatOrders();
  assert.equal(core.eggOrders.length,1,'explicit resume makes exactly one new paid order');
});

test('empty stock, disconnected/full nursery, queen death and cap stop without debit',()=>{
  const {g,room}=fixture(0),core=g.lifecycle;
  const check=(reason,prepare)=>{
    core.setRepeatOrder(room.id,'miner',1,true);
    const before=core.heldEgg.carbs;
    prepare();
    core.tickRepeatOrders();
    assert.equal(core.getRepeatOrder(room.id).plan.state,'paused');
    assert.equal(core.getRepeatOrder(room.id).plan.stopReason,reason);
    assert.equal(core.heldEgg.carbs,before);
    assert.equal(core.eggOrders.length,0);
  };
  check('insufficient-resources',()=>{});
  check('nursery-unavailable',()=>{room.connected=false;});
  room.connected=true;
  // Full room is checked by the real queueEgg, never by an independent debit path.
  const prior=core.nurseryStatus.bind(core);
  core.nurseryStatus=id=>id===room.id?{slots:1,used:1,free:0,orders:[]}:prior(id);
  check('nursery-full',()=>{});
  core.nurseryStatus=prior;
  // Other brood reserves the global population cap.
  for(let i=0;i<LIFE.maxPopulation-g.population;i++)core.brood.push({id:'cap-'+i});
  check('population-cap',()=>{});
  core.brood.length=0;
  check('queen-dead',()=>{g.colony.queen.alive=false;});
});

test('normal physical hatch clears exactly one auto slot and creates one next paid order',()=>{
  const {g,room}=fixture(40),core=g.lifecycle;
  core.setRepeatOrder(room.id,'miner',1,true);
  advance(g,1);
  const first=core.getRepeatOrder(room.id).plan.activeOrderId;
  assert.ok(first);
  advance(g,1199);
  // The actual fixed-tick run hatches TWO adults by tick 1200;
  // the next outstanding order is the third paid cycle, not a duplicate.
  assert.equal(core.births,2,'two real natural hatchings via delivery, care and larval protein');
  const next=core.getRepeatOrder(room.id).plan;
  assert.equal(next.state,'waiting');
  assert.ok(next.activeOrderId && next.activeOrderId!==first);
  assert.equal(next.activeOrderId,'egg-3');
  assert.equal(core.eggOrders.length,1);
  assert.equal(core.eggOrders[0].id,next.activeOrderId);
  assert.equal(core.eggOrders[0].status,'QUEUED');
  assert.equal(core.heldEgg.carbs,1,'third order is paid escrow, not an immediate egg');
  assert.equal(core.heldEgg.protein,1);
  assert.equal(core.eggSpent.carbs,2,'the two laid eggs moved held to spent');
  assert.equal(core.eggSpent.protein,2);
  assert.ok(core.consumed.protein>=2,'larval protein must be consumed');
  for(const type of ['carbs','protein'])
    assert.equal(g.foraging.inventory[type]+core.heldEgg[type]+core.eggSpent[type]+core.consumed[type],40,
      type+' must be conserved across 3 paid cycles and natural consumption');
  assert.equal(g.colony.workers.filter(w=>w.profession==='miner').length,2);
});

test('lost brood pauses repeat without refund or automatic replacement',()=>{
  const {g,room}=fixture(),core=g.lifecycle;
  core.setRepeatOrder(room.id,'miner',1,true);
  advance(g,LIFE.layInterval);
  const order=core.eggOrders[0],baby=core.brood.find(b=>b.orderId===order.id);
  assert.ok(baby);
  order.status='INCUBATING';
  baby.roomId=room.id;baby.carrierId=null;baby.stage='larva';
  baby.age=core.hatchStages(baby.level).larva;
  baby.care=0;baby.waiting=LIFE.broodTimeout;
  const spent={...core.eggSpent};
  core.tickBrood();
  assert.equal(core.eggOrders.length,0);
  assert.equal(core.broodDeaths,1);
  assert.equal(core.getRepeatOrder(room.id).plan.stopReason,'brood-lost');
  core.tickRepeatOrders();
  assert.equal(core.eggOrders.length,0);
  assert.deepEqual(core.eggSpent,spent,'laid eggs cannot be refunded on brood loss');
});

test('two Nursery plans are independent, stably ordered and do not overspend shared stock',()=>{
  const {g,room}=fixture(1),core=g.lifecycle;
  const second={...room,id:'nursery-b',stock:{carbs:0,protein:0,water:0}};
  g.rooms.rooms.push(second);
  core.setRepeatOrder(second.id,'miner',1,true);
  core.setRepeatOrder(room.id,'miner',1,true);
  core.tickRepeatOrders();
  assert.equal(core.eggOrders.length,1);
  assert.equal(core.eggOrders[0].roomId,'nursery-a');
  assert.equal(core.getRepeatOrder(second.id).plan.stopReason,'insufficient-resources');
  assert.equal(core.heldEgg.carbs,1);
  assert.equal(core.heldEgg.protein,1);
  core.tickRepeatOrders();
  assert.equal(core.eggOrders.length,1);
});

test('paused simulation freezes auto presets; x1/x2/x4 deterministic; fresh Seed resets',()=>{
  function replay(speed,frames){
    const {g,room}=fixture();
    g.setSpeed(speed);
    g.lifecycle.setRepeatOrder(room.id,'forager',1,true);
    advance(g,frames);
    return {tick:g.lifecycle.tickCount,
      orders:g.lifecycle.eggOrders.map(o=>[o.id,o.status,o.roomId,o.cost]),
      repeat:g.lifecycle.getRepeatOrder(room.id).plan,
      held:{...g.lifecycle.heldEgg}};
  }
  const zero=replay(0,400);
  assert.equal(zero.tick,0);assert.equal(zero.repeat.state,'armed');
  assert.equal(zero.orders.length,0);
  const expected=replay(1,100);
  assert.deepEqual(replay(2,50),expected);
  assert.deepEqual(replay(4,25),expected);
  const fresh=new Game('newborn');
  assert.equal(fresh.lifecycle.repeatPlans.size,0);
  assert.equal(fresh.lifecycle.eggOrders.length,0);
});
