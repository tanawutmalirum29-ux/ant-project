/**
 * COLONY_SURVIVAL_LOOP_V1 — deterministic physical-resource survival acceptance.
 * No mock room, free stock, synthetic birth, state mutation or fast-forwarding.
 * The script uses only the same public gameplay commands that a player can issue.
 *
 * Explicit repeat re-arms and soldier orders ARE scripted PLAYER actions:
 * this is a bounded, actively managed survival route, not unattended automation.
 * Browser accessibility and player UX are verified by separate real-browser CI.
 */
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

const TYPES = ['carbs', 'protein', 'water'];
const SEEDS = ['ANT-001', 'survival-seed-02', 'survival-seed-03'];
const EARLY_ORDERS = [
  'soldier','soldier','nurse','soldier','soldier','miner',
  'soldier','soldier','nurse','soldier','soldier','soldier'
];
const mass = (items, fn) => items.reduce((total, item) => total + fn(item), 0);

function physicalLedger(game) {
  const initial = Object.fromEntries(TYPES.map(type => [
    type, mass(game.world.resources, node => node.type === type ? node.initialAmount : 0)
  ]));
  let assertions = 0;
  return {
    check(tick) {
      for (const type of TYPES) {
        const left = initial[type] + game.ecology.regenerated[type];
        const nodes = mass(game.world.resources, n => n.type === type ? n.amount : 0);
        const depot = game.foraging.inventory[type];
        const roomStocks = mass(game.rooms.rooms, r => r.stock?.[type] ?? 0);
        const cargo = mass(game.colony.workers,
          ant => ant.cargo?.type === type ? (ant.cargo.amount ?? 0) : 0);
        const right = nodes + depot + cargo +
          game.rooms.held[type] + game.rooms.spent[type] +
          game.lifecycle.heldEgg[type] + game.lifecycle.eggSpent[type] +
          game.lifecycle.consumed[type] + game.lifecycle.lost[type] +
          game.research.held[type] + game.research.spent[type];
        assert.equal(roomStocks, depot,
          'physical depot / inventory mismatch: ' + JSON.stringify({tick,type,roomStocks,depot}));
        assert.equal(right, left,
          'mass conservation failed: ' + JSON.stringify({tick,type,left,right,nodes,depot,cargo}));
        assertions++;
      }
    },
    get count() { return assertions; }
  };
}

function route(seed, ticks, longRun = false) {
  const game = new Game(seed);
  assert.equal(game.clock.ticks, 0);
  assert.equal(game.foraging.delivered, 0);
  assert.deepEqual(game.foraging.inventory, {carbs:0,protein:0,water:0});
  const queen = game.colony.queen;
  const ledger = physicalLedger(game);
  let room = null;
  let enabled = false;
  let builtAt = null;
  let ordersAccepted = 0;
  let earlyAccepted = 0;
  let explicitRearms = 0;
  let firstNaturalHatch = null;
  let starterRemainingAt18k = null;
  const attemptedFailures = {};
  const snapshots = [];

  for (let tick = 1; tick <= ticks; tick++) {
    // Construct an actual 2x2 Nursery with genuinely foraged and delivered stock.
    if (!room && tick % 40 === 0) {
      const result = game.rooms.queue('nursery', queen.x, queen.y - 3, 2, 2);
      if (result.ok) room = result.room;
    }
    // A user's first opt-in, only after physical construction completes.
    if (room?.status === 'ready' && !enabled) {
      const result = game.lifecycle.setRepeatOrder(room.id, 'forager', 1, true);
      assert.equal(result.ok, true, 'Could not enable legally built Nursery');
      enabled = true;
      builtAt = tick;
    }
    // Repeat PAUSES on stock/room constraint. Re-arm requires explicit user action;
    // never grant stock or silently bypass an engine stop condition.
    if (enabled && tick % 180 === 0 && queen.alive) {
      const status = game.lifecycle.getRepeatOrder(room.id).plan;
      if (status.state === 'paused') {
        const result = game.lifecycle.setRepeatOrder(room.id, 'forager', 1, true);
        assert.equal(result.ok, true);
        explicitRearms++;
      }
    }
    // Manual soldier and specialist orders deliberately have the normal priority
    // over the next advancing-tick automatic order and must be fully paid.
    if (enabled && tick % 200 === 0 && earlyAccepted < EARLY_ORDERS.length) {
      const profession = EARLY_ORDERS[earlyAccepted];
      const result = game.lifecycle.queueEgg(room.id, profession, 1);
      if (result.ok) { ordersAccepted++; earlyAccepted++; }
      else attemptedFailures[result.reason] = (attemptedFailures[result.reason] ?? 0) + 1;
    }
    // A human can replace soldiers and nurses after starter adults age out.
    if (longRun && enabled && earlyAccepted === EARLY_ORDERS.length &&
        tick > 6000 && tick % 360 === 0 && queen.alive) {
      const count = profession => game.colony.workers.filter(a => a.profession === profession).length;
      const profession = count('nurse') < 2 ? 'nurse' :
        count('soldier') < 8 ? 'soldier' : null;
      if (profession) {
        const result = game.lifecycle.queueEgg(room.id, profession, 1);
        if (result.ok) ordersAccepted++;
        else attemptedFailures[result.reason] = (attemptedFailures[result.reason] ?? 0) + 1;
      }
    }

    // Advance exactly one authorized 100ms fixed tick, not a debug tick method.
    const advanced = game.update(100);
    assert.ok(advanced === undefined || advanced >= 0, 'Invalid fixed-step advancement');
    if (firstNaturalHatch === null && game.lifecycle.births > 0) firstNaturalHatch = tick;
    if (tick % 300 === 0) ledger.check(tick);
    if (tick === 18000) {
      starterRemainingAt18k = game.colony.workers.filter(
        ant => /^worker-[1-5]$/.test(ant.id)
      ).length;
    }
    if (tick % 6000 === 0 || tick === ticks) {
      snapshots.push({tick,queenAlive:queen.alive,workers:game.colony.workers.length,
        births:game.lifecycle.births,delivered:game.foraging.delivered});
    }
    assert.equal(queen.alive, true,
      'Queen defeated before acceptance endpoint: ' + JSON.stringify({seed,tick,defeat:game.defeat}));
  }
  assert.ok(room, 'No legal Nursery could be constructed in ' + seed);
  assert.equal(room.status, 'ready', 'Nursery not actually completed');
  assert.equal(enabled, true, 'No player repeat order enabled');
  assert.equal(earlyAccepted, EARLY_ORDERS.length, 'Manual soldier/nurse defense not fully funded');
  assert.ok(game.lifecycle.births >= (longRun ? 18 : 15), 'Insufficient natural born adults');
  assert.ok(game.foraging.delivered >= (longRun ? 600 : 240), 'No meaningful real logistics');
  if (longRun) {
    assert.equal(starterRemainingAt18k, 0, 'Starter adults remain past ordinary lifetime');
    assert.ok(game.colony.workers.length >= 1, 'No living second generation at endpoint');
  }
  assert.equal(ledger.count, Math.floor(ticks / 300) * TYPES.length, 'Not all mass checkpoints executed');
  const result = {
    seed, ticks, queenAlive:queen.alive, queenHP:game.combat.queenHP,
    nurseryReadyAt:builtAt, manualPaidOrders:ordersAccepted,
    explicitRearms, firstNaturalHatch, births:game.lifecycle.births,
    workersAtEnd:game.colony.workers.length, delivered:game.foraging.delivered,
    remainingStarterAt18k:starterRemainingAt18k, massAssertions:ledger.count,
    rejectedManualOrders:attemptedFailures, snapshots,
    repeatPlan:game.lifecycle.getRepeatOrder(room.id).plan,
    stock:{...game.foraging.inventory}
  };
  console.log('LEGAL_SURVIVAL_PASS ' + JSON.stringify(result));
  return result;
}

for (const seed of SEEDS) route(seed, 6200);
route('ANT-001', 30000, true);
console.log('LEGAL_SURVIVAL_G3_PASS 3_SEEDS_6200_TICKS PLUS ANT001_30000_TICKS');
