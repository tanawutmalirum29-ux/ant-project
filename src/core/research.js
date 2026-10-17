import { BASE_CAPACITY, ROOM_CATALOG } from './rooms.js';

const TYPES = Object.freeze(['carbs', 'protein', 'water']);
const zeros = () => ({ carbs: 0, protein: 0, water: 0 });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const rows = [
  { id: 'foraging_routes', title: 'เส้นทางขนส่ง',
    description: 'เพิ่มปริมาณอาหารและน้ำที่มดขนส่งได้ต่อเที่ยว',
    effectLabel: 'ขนส่งเพิ่ม 1 หน่วยต่อเที่ยว', prerequisiteIds: [],
    cost: { carbs: 6, protein: 4, water: 3 }, totalTicks: 600 },
  { id: 'excavation_tools', title: 'เครื่องมือขุด',
    description: 'ปรับปรุงเครื่องมือให้มดขุดดินได้เร็วขึ้น',
    effectLabel: 'ความเร็วขุด +15%', prerequisiteIds: [],
    cost: { carbs: 8, protein: 5, water: 4 }, totalTicks: 800 },
  { id: 'construction_techniques', title: 'เทคนิคก่อสร้าง',
    description: 'เพิ่มประสิทธิภาพการก่อสร้างห้องในรัง',
    effectLabel: 'ความเร็วสร้างห้อง +15%', prerequisiteIds: ['excavation_tools'],
    cost: { carbs: 8, protein: 6, water: 5 }, totalTicks: 900 },
  { id: 'nursery_care', title: 'การดูแลตัวอ่อน',
    description: 'ลดระยะการเติบโตของไข่และตัวอ่อนในห้องฟัก',
    effectLabel: 'ระยะพัฒนาตัวอ่อน -10%', prerequisiteIds: ['construction_techniques'],
    cost: { carbs: 9, protein: 8, water: 7 }, totalTicks: 1100 },
  { id: 'warehouse_extension', title: 'ขยายคลัง',
    description: 'เพิ่มความจุจริงของห้องเก็บทรัพยากรทุกประเภท',
    effectLabel: 'ความจุคลัง +20%', prerequisiteIds: ['foraging_routes'],
    cost: { carbs: 10, protein: 6, water: 8 }, totalTicks: 1050 },
  { id: 'soldier_armor', title: 'เกราะทหาร',
    description: 'เพิ่มความทนทานสูงสุดของมดทหารทุกกอง',
    effectLabel: 'HP สูงสุดทหาร +15%', prerequisiteIds: ['construction_techniques'],
    cost: { carbs: 9, protein: 12, water: 8 }, totalTicks: 1400 }
];

function checkedCatalog(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('Invalid research catalog');
  const ids = new Set();
  const normalized = rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(row.id) ||
        ids.has(row.id) || !Number.isSafeInteger(row.totalTicks) || row.totalTicks <= 0 ||
        !Array.isArray(row.prerequisiteIds) || !row.cost ||
        typeof row.title !== 'string' || typeof row.description !== 'string' ||
        typeof row.effectLabel !== 'string') throw new TypeError('Invalid research catalog entry');
    const cost = zeros();
    for (const type of TYPES) {
      if (!Number.isSafeInteger(row.cost[type]) || row.cost[type] < 0)
        throw new TypeError('Invalid research resource cost');
      cost[type] = row.cost[type];
    }
    if (Object.keys(row.cost).some(type => !TYPES.includes(type)) ||
        TYPES.every(type => cost[type] === 0)) throw new TypeError('Invalid research cost');
    if (new Set(row.prerequisiteIds).size !== row.prerequisiteIds.length ||
        row.prerequisiteIds.some(id => typeof id !== 'string'))
      throw new TypeError('Invalid research prerequisites');
    ids.add(row.id);
    return { id: row.id, title: row.title, description: row.description,
      effectLabel: row.effectLabel, prerequisiteIds: [...row.prerequisiteIds],
      cost, totalTicks: row.totalTicks };
  });
  const map = new Map(normalized.map(row => [row.id, row]));
  const seen = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new TypeError('Cyclic research prerequisites');
    if (seen.has(id)) return;
    visiting.add(id);
    for (const dep of map.get(id).prerequisiteIds) {
      if (!map.has(dep)) throw new TypeError('Unknown research prerequisite');
      visit(dep);
    }
    visiting.delete(id);
    seen.add(id);
  }
  for (const row of normalized) visit(row.id);
  return deepFreeze(normalized);
}

export const RESEARCH_CATALOG = checkedCatalog(rows);
const success = (runId) => ({ ok: true, runId });
const failure = (code) => ({ ok: false, error: { code } });
const validAmount = n => Number.isSafeInteger(n) && n >= 0;

/** Real depot-funded fixed-tick research; never alters gameplay effects directly. */
export class Research {
  #rooms;
  #foraging;
  #colony;
  #isDefeated;
  #catalog;
  #catalogById;
  #completed = new Set();
  #active = null;
  #held = zeros();
  #spent = zeros();
  #revision = 0;
  #nextRunId = 1;
  #lastAdvancedTick = 0;

  constructor({ rooms, foraging, colony, isDefeated, catalog = RESEARCH_CATALOG }) {
    if (!rooms || !foraging || !colony || typeof isDefeated !== 'function')
      throw new TypeError('Research requires live game dependencies');
    this.#rooms = rooms;
    this.#foraging = foraging;
    this.#colony = colony;
    this.#isDefeated = isDefeated;
    this.#catalog = catalog === RESEARCH_CATALOG ? RESEARCH_CATALOG : checkedCatalog(catalog);
    this.#catalogById = new Map(this.#catalog.map(row => [row.id, row]));
  }

  get held() { return deepFreeze({ ...this.#held }); }
  get spent() { return deepFreeze({ ...this.#spent }); }

  hasCompleted(techId) { return this.#completed.has(techId); }

  #dead() {
    return this.#colony.queen?.alive === false || !!this.#isDefeated();
  }

  #physicalStockOK() {
    if (!Array.isArray(this.#rooms.rooms) || !this.#foraging.inventory) return false;
    for (const type of TYPES) {
      const inventory = this.#foraging.inventory[type];
      if (!validAmount(inventory) || !validAmount(this.#held[type]) ||
          !validAmount(this.#spent[type])) return false;
      let sum = 0;
      for (const room of this.#rooms.rooms) {
        const amount = room?.stock?.[type];
        if (!validAmount(amount) || !Number.isSafeInteger(sum + amount)) return false;
        sum += amount;
      }
      if (sum !== inventory) return false;
    }
    return true;
  }

  #eligible(type) {
    // storageSlots is the same physical depot selector used by foragers and Nursery.
    const slots = this.#rooms.storageSlots(type);
    if (!Array.isArray(slots)) return [];
    return slots.map(slot => slot.room).filter(room =>
      !!room && room.status === 'ready' && room.connected === true &&
      (room.type === 'queen' || (type === 'water' ?
        room.type === 'water_store' : room.type === 'food_store')));
  }

  #available() {
    const inventory = zeros();
    const sources = {};
    for (const type of TYPES) {
      const depots = this.#eligible(type);
      sources[type] = depots;
      for (const room of depots) {
        const amount = room.stock?.[type];
        if (!validAmount(amount) || !Number.isSafeInteger(inventory[type] + amount))
          return null;
        inventory[type] += amount;
      }
    }
    return { inventory, sources };
  }

  #physicalCap(room, type) {
    if (!room || !TYPES.includes(type)) return null;
    const base = room.type === 'queen' ? BASE_CAPACITY[type] :
      (room.capacity?.[type] ?? ROOM_CATALOG[room.type]?.capacity?.[type] ?? 0);
    if (!validAmount(base)) return null;
    const effective = this.hasCompleted('warehouse_extension') ?
      Math.floor(base * 120 / 100) : base;
    return Number.isSafeInteger(effective) ? effective : null;
  }

  #otherRefundClaims(roomId, type) {
    let total = 0;
    for (const order of this.#rooms.lifecycle?.eggOrders || []) {
      if (order.status !== 'QUEUED') continue;
      for (const part of order.pickups || []) {
        if (part.sourceRoomId === roomId && part.type === type) total += part.amount;
      }
    }
    for (const order of this.#rooms.rooms) {
      if (order.status !== 'planned' && order.status !== 'building') continue;
      for (const part of order.pickups || []) {
        if (part.sourceRoomId === roomId && part.type === type) total += part.amount;
      }
    }
    return validAmount(total) ? total : null;
  }

  /** Exact capacity liability for Rooms.storageSlots; no mutation or room dependency cycle. */
  refundableFor(roomId, type) {
    if (!TYPES.includes(type) || typeof roomId !== 'string' || !this.#active) return 0;
    return this.#active.pickups.reduce((sum, part) =>
      sum + (part.sourceRoomId === roomId && part.type === type ? part.amount : 0), 0);
  }

  #refundCheck() {
    if (!this.#active) return false;
    const amountBySource = new Map();
    for (const part of this.#active.pickups) {
      const key = part.sourceRoomId + ':' + part.type;
      amountBySource.set(key, (amountBySource.get(key) || 0) + part.amount);
    }
    for (const [key, amount] of amountBySource) {
      const part = this.#active.pickups.find(p => p.sourceRoomId + ':' + p.type === key);
      const room = this.#rooms.rooms.find(r => r.id === part.sourceRoomId);
      if (!room || !validAmount(amount) || !validAmount(room.stock?.[part.type]))
        return false;
      const cap = this.#physicalCap(room, part.type);
      const other = this.#otherRefundClaims(room.id, part.type);
      if (cap === null || other === null ||
          room.stock[part.type] + amount + other > cap) return false;
    }
    return true;
  }

  snapshot() {
    const funds = this.#available();
    const inventory = { ...(funds?.inventory || zeros()) };
    const completedIds = this.#catalog.filter(row => this.#completed.has(row.id))
      .map(row => row.id);
    const technologies = this.#catalog.map(row => {
      const missingPrerequisiteIds = row.prerequisiteIds.filter(id => !this.#completed.has(id));
      const missingResources = zeros();
      for (const type of TYPES) missingResources[type] = Math.max(0, row.cost[type] - inventory[type]);
      let status = this.#completed.has(row.id) ? 'COMPLETED' :
        missingPrerequisiteIds.length ? 'LOCKED' : 'AVAILABLE';
      if (this.#active?.techId === row.id) status = this.#active.status;
      return { id: row.id, title: row.title, description: row.description,
        effectLabel: row.effectLabel, prerequisiteIds: [...row.prerequisiteIds],
        missingPrerequisiteIds, cost: { ...row.cost }, totalTicks: row.totalTicks,
        status, missingResources,
        canStart: status === 'AVAILABLE' && !this.#active && !this.#dead() &&
          !!funds && TYPES.every(type => missingResources[type] === 0) };
    });
    const active = this.#active ? {
      runId: this.#active.runId, techId: this.#active.techId,
      status: this.#active.status, startedTick: this.#active.startedTick,
      progressTicks: this.#active.progressTicks, totalTicks: this.#active.totalTicks,
      cost: { ...this.#active.cost },
      pickups: this.#active.pickups.map(part => ({ ...part }))
    } : null;
    return deepFreeze({
      schemaVersion: 1, revision: this.#revision, completedIds, technologies,
      active, inventory, held: { ...this.#held }, spent: { ...this.#spent },
      refundPreview: this.#active && this.#refundCheck() ? { ...this.#active.cost } : null
    });
  }

  start(techId) {
    if (this.#dead()) return failure('GAME_OVER');
    const row = this.#catalogById.get(techId);
    if (!row) return failure('INVALID_TECH');
    if (this.#completed.has(techId)) return failure('ALREADY_RESEARCHED');
    if (this.#active) return failure('RESEARCH_ACTIVE');
    if (row.prerequisiteIds.some(id => !this.#completed.has(id)))
      return failure('PREREQUISITE_LOCKED');
    if (!this.#physicalStockOK() || !Number.isSafeInteger(this.#nextRunId))
      return failure('INTERNAL_INVARIANT_ERROR');
    const funds = this.#available();
    if (!funds) return failure('INTERNAL_INVARIANT_ERROR');
    if (TYPES.some(type => funds.inventory[type] < row.cost[type]))
      return failure('INSUFFICIENT_RESOURCES');

    const pickups = [];
    for (const type of TYPES) {
      let needed = row.cost[type];
      for (const room of funds.sources[type]) {
        const amount = Math.min(needed, room.stock[type]);
        if (amount > 0) {
          pickups.push({ sourceRoomId: room.id, type, amount });
          needed -= amount;
        }
        if (needed === 0) break;
      }
      if (needed !== 0) return failure('INTERNAL_INVARIANT_ERROR');
    }
    // Preflight the future exact refund as well, including other outstanding claims.
    for (const part of pickups) {
      const room = this.#rooms.rooms.find(r => r.id === part.sourceRoomId);
      const cap = this.#physicalCap(room, part.type);
      const other = this.#otherRefundClaims(room.id, part.type);
      if (cap === null || other === null ||
          room.stock[part.type] + other > cap)
        return failure('REFUND_SOURCE_UNAVAILABLE');
    }
    const newInventory = { ...this.#foraging.inventory };
    const nextHeld = { ...this.#held };
    for (const part of pickups) {
      newInventory[part.type] -= part.amount;
      nextHeld[part.type] += part.amount;
      if (!validAmount(newInventory[part.type]) || !validAmount(nextHeld[part.type]))
        return failure('INTERNAL_INVARIANT_ERROR');
    }
    for (const part of pickups) {
      const room = this.#rooms.rooms.find(r => r.id === part.sourceRoomId);
      room.stock[part.type] -= part.amount;
    }
    for (const type of TYPES) this.#foraging.inventory[type] = newInventory[type];
    this.#held = nextHeld;
    // foraging.tickCount and game.clock.ticks agree at all public command boundaries.
    // The CEO invokes tick(game.clock.ticks + 1) after foraging.tick() each step.
    const startedTick = Number.isSafeInteger(this.#foraging.tickCount) &&
      this.#foraging.tickCount >= 0 ? this.#foraging.tickCount : 0;
    const runId = this.#nextRunId++;
    this.#active = { runId, techId, status: 'QUEUED', startedTick,
      progressTicks: 0, totalTicks: row.totalTicks, cost: { ...row.cost },
      pickups };
    this.#revision++;
    return success(runId);
  }

  cancel(runId) {
    if (this.#dead()) return failure('GAME_OVER');
    if (!this.#active) return failure('NO_ACTIVE_RESEARCH');
    if (runId !== this.#active.runId) return failure('STALE_RUN_ID');
    if (!this.#refundCheck()) return failure('REFUND_SOURCE_UNAVAILABLE');
    if (!this.#physicalStockOK()) return failure('INTERNAL_INVARIANT_ERROR');
    const newInventory = { ...this.#foraging.inventory };
    const nextHeld = { ...this.#held };
    for (const part of this.#active.pickups) {
      newInventory[part.type] += part.amount;
      nextHeld[part.type] -= part.amount;
      if (!validAmount(newInventory[part.type]) || !validAmount(nextHeld[part.type]))
        return failure('INTERNAL_INVARIANT_ERROR');
    }
    for (const part of this.#active.pickups) {
      const room = this.#rooms.rooms.find(r => r.id === part.sourceRoomId);
      room.stock[part.type] += part.amount;
    }
    for (const type of TYPES) this.#foraging.inventory[type] = newInventory[type];
    this.#held = nextHeld;
    const runIdDone = this.#active.runId;
    this.#active = null;
    this.#revision++;
    return success(runIdDone);
  }

  tick(simTick) {
    if (!Number.isSafeInteger(simTick) || simTick <= 0 || this.#dead() ||
        simTick <= this.#lastAdvancedTick) return;
    this.#lastAdvancedTick = simTick;
    if (!this.#active || simTick <= this.#active.startedTick) return;
    this.#active.status = 'RESEARCHING';
    this.#active.progressTicks++;
    this.#revision++;
    if (this.#active.progressTicks !== this.#active.totalTicks) return;
    for (const type of TYPES) {
      this.#held[type] -= this.#active.cost[type];
      this.#spent[type] += this.#active.cost[type];
    }
    this.#completed.add(this.#active.techId);
    this.#active = null;
  }
}
