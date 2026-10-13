# Ant Kingdom — R4 Sustainable Colony Ecology: technical design (Stage 0)

**Task:** R4-ECO-DESIGN-01 / AI-1 / Issue #35  
**Status:** PROPOSED — design only; not implemented, benchmarked, or playtested  
**Source baseline:** main at 3a5c7a93ac3a0f22f2c5a72d60ad9884adad9c65 (2026-10-13, UTC+7)  
**Authority:** https://github.com/tanawutmalirum29-ux/ant-project/issues/35  
**Scope of this PR:** this design and docs/ai-reports/AI-1/ROUND_04.md only.

## 1. Decision for AI-HEAD

**Recommend Alternative A: bounded, seed-deterministic renewal of existing surface resource nodes, with explicit external-ecology inflow journals and strict per-type budgets.** Retain the current physical harvesting, portal, cargo, warehouse, consumption, death and construction flows. Do not create new forage entities, inject nutrition into storage, or increase the existing immutable initialAmount. Make renewal an **explicit opt-in simulation policy** initially, so existing finite-world accounting tests remain byte-for-byte unchanged. The playable browser entry point may select the renewable policy after its independent integration gate; it must also select that policy when creating a new world.

**Non-goals for Stage 1:** seasonal weather UI, new plants/insect AI, life-cycle tuning, per-worker metabolism balancing, terrain mutation APIs, persistence/save UI, combat changes, and rendering. No source code or tests are modified by this design PR.

## 2. As-is code audit: real flow and limits

| Component | Source evidence (main line numbers) | Observed behavior / risk |
|---|---|---|
| World and terrain | src/world/generate.js L3-L11, L36-L61, L84-L93 | Seeded surface 128×128 and underground 96×64; portal at surface (64,64), underground (48,15). Walkable surface may include entrance; renewable sites must independently exclude portal. |
| Node creation | src/world/resources.js L5-L38 | 24 deterministic candidates selected around the real surface portal from BFS-reachable walkable tiles, cardinal path distance 6–36, Manhattan spacing ≥5. Nine or more are required; the usual target is 24. Types repeat carbs/protein/water and initial per-node stock is **16,18,…,32**. No live renewal. Node fields: id,x,y,type,kind,amount,initialAmount,reserved,distance. |
| Navigation | src/world/navigation.js L3-L10, L66-L86 | isWalkable(surface) excludes WATER/STONE/THICKET, but **not** ENTRANCE; reachablePaths performs one cardinal BFS; findPath performs A*. Existing source-node distance is a path distance, not straight-line distance. |
| Source reservation | src/core/foraging.js L6-L8, L26-L34, L65-L85 | Capacity 3/worker, gathering 5 ticks; reservation reserves at most amount-reserved; reservation is a claim on node.amount, **not an extra physical stock**. Source is chosen partly by warehouse space and nutrient balance. |
| Physical pickup | src/core/foraging.js L115-L159 | Worker travels underground → actual portal → surface node, gathers, decrements node.amount and creates carried cargo, returns through portal, then walks to ready storage. Successful delivery increases actual room stock and aggregate inventory; a full store leaves cargo in transit. |
| Adult consumption | src/core/lifecycle.js L5-L11, L47-L52, L185-L201 | Worker/queen eat carbs on hunger ≥850 ticks and drink water on thirst ≥1300; resting slows hunger. Consumption is possible only from actual stored material via Rooms.take. Starvation/thirst/death thresholds differ; queen also has natural maximum age. |
| Brood and population | src/core/lifecycle.js L202-L245 | Egg laying attempts every 180 ticks and costs 1 stored protein; larva→pupa costs another protein after care; egg/larva/pupa minimum nominal phases 100/180/160 ticks plus care, food and transport; maximum population 150. Protein absence blocks laying, **not immediate queen death**. |
| Stock and construction | src/core/rooms.js L5-L13, L24-L52, L69-L107, L157-L187 | Queen initial capacity 24 per type; food store +40 carbs/+40 protein; water store +50 water; construction reserves real delivered materials into held, then converts to spent or refunds. inventory is an **aggregate mirror** of individual physical room stocks, not another physical pool. |
| Disconnection and performance | src/core/rooms.js L49-L93, L189-L206, L346-L360 | Only ready, eligible stores accept deposits / supply consumption; disconnected stock remains physical. Rooms.updateConnectivity computes reachable(room) per room, with a BFS per call, each tick—pre-existing scale cost; do not broaden this task. |
| Death | src/core/lifecycle.js L54-L77 | Death releases source reservations and counts already-carried food as lost. Construction pickups remain recoverable via Rooms.onWorkerDeath. Combat uses the existing lifecycle/death path; do not add ecology death accounting. |
| Time, RNG and reset | src/core/time.js L1-L4, L26-L47; src/core/random.js L1-L29; src/core/game.js L9-L28; src/main.js L7-L17 | One simulation tick=100 ms at x1, 10 TPS, 0.3 **game minute/tick**; pause performs no step, x1/x2/x4 alter wall time only. Existing world reset constructs fresh Game(seed). The Game systems execute colony→foraging→rooms→lifecycle→combat; no ecology system or save/load exists. |
| Existing contractual tests | tests/economy-accounting.audit.test.mjs L18-L78, L109-L398; tests/foraging.test.mjs L18-L32, L113-L130; docs/GAME_SYSTEMS.md L13-L20; docs/development/ROUND_02_ROADMAP.md L40-L46 | ECO-01..12 track each resource category, reservations, room caps, deaths, cancellation, disconnected stores and pause; U3.7 asserts zero-resource finite mode. Existing tests assume **no external inflow**. Must preserve their finite policy and add renewable-mode tests. |

### Baseline supply and demand: arithmetic, not measured gameplay

- At **24** sources with eight per type, theoretical initial stocks per type lie between **128 and 256 units**, average **192** if each 16..32 realization is typical; total theoretical **384..768**, typical **576**. These are bounds/expectations based on creation code, **not measured seeds**. If fewer than 24 sources are generated, recalculate by the actual per-type node count.
- Nominal adult demand (ignoring rest, shortages, deaths) per 100 simulation ticks is about (N+1)×100/850 carbs and (N+1)×100/1300 water, where N is workers, +1 is the queen. For N=5: ~0.71 carbs, ~0.46 water; N=30: ~3.65 and ~2.38; N=100: ~11.88 and ~7.77. Consumption happens in discrete events; this is a **long-run rate**, not a guaranteed amount per 100-tick sample.
- If the queen reproduces continuously, theoretical protein cost is ~100/180 for egg laying plus up to another ~100/180 for larval maturation (~1.11 protein/100 ticks once pipeline stabilizes). Care/travel/death will lower actual throughput; construction adds one-time demand.
- Effective transport capacity is strictly smaller than ecology inflow if too few foragers are allocated. At speed 0.34 tiles/tick, a trip requiring roughly 30..90 tile steps round-trip plus gathering takes ~94..270+ ticks, yielding roughly **1.1..3.2 units per 100 ticks per continually working forager** before congestion, storage availability and target selection. Range is a crude travel estimate, **not a measured throughput**. Production must measure mean/p95 trip duration and deliveries by type.
- A 100-worker colony with at most four foragers is **not automatically sustainable** even when sources continually refill; deliberately preserve logistical scarcity. At 100 workers, the proposed carbs supply budget below is also lower than nominal adult demand.

## 3. Alternatives and selection

| Dimension | A — Periodic renewal of fixed 24 nodes (RECOMMENDED) | B — Seeded seasons + migrating node growth |
|---|---|---|
| Core | Every 200 fixed ticks, refill only existing reachable surface nodes under a strict budget | Deterministic season phases change rates and may create/migrate surface nodes |
| Experience | Clear, learnable forage locations; meaningful worker allocation, warehouse and travel bottlenecks | More discovery, seasonal preparation and relocation; harder winter survival |
| World consistency | Existing terrain, source IDs, reservations, UI and pathfinding remain stable | Must reconcile disappearing nodes, worker reservations/paths and world edits |
| Conservation | Simple journaled external inflow into existing node.amount, one write path | Requires ledger for each birth/migration/despawn; retiring positive-stock nodes needs loss ledger or physical transfer |
| Determinism | Stateless hash by seed+epoch, stable sorted node IDs, fixed integer budgets | More state, event-order and migration collision risk |
| Performance | One BFS **per renewal event** (not per tick), at most 24 nodes evaluated | Potential large candidate scan, BFS and reallocation on season transitions |
| Exploit risks | Infinite farming is bounded by node/world/type caps and movement; warehouses never credited for free | Seasonal reset farming, re-seeding stock, duplicate node identity, free resource on node migration |
| Risk/phase | Low-to-medium; compatible with existing accounting using policy opt-in | High; requires distinct design/implementation and broader test matrix |
| Deferred use | Stage 1 foundation | Potential R4 Stage 2 only **after** measured balance is healthy |

A second lower-risk variant (A0: fixed budget renews even when node blocked) is **rejected**: it violates physically reachable spawn policy and creates inaccessible stocks without useful foraging.

## 4. Recommended renewable model — all constants PROPOSED / NOT MEASURED

**Policy:** finite (legacy default for code/API clients) or renewable (explicit opt-in on Game). Browser entry selects renewable only after HEAD's separate implementation/release approval.

| Knob | Proposed Stage-1 value | Rationale / hard limit |
|---|---:|---|
| First renewal | Simulation tick 200 | 60 game minutes; the opening 30-minute window still tests initial finite scarcity. |
| Event period | Every 200 simulation ticks | Exactly one event per 60 game minutes (at 0.3 game minute/tick); 18 events in 3600 ticks. No wall-clock timers. |
| Per-event carbs budget | 12 units | 6/100 ticks theoretical inflow, enough for ~30 adults in an ideal system but less than demand at 100. |
| Per-event protein budget | 6 units | 3/100 ticks theoretical; supports some brood and construction at lower populations. |
| Per-event water budget | 12 units | 6/100 ticks theoretical; water demand and physical delivery still matter. |
| Node amount hard cap | 32 units | Matches upper initial node amount; never expands an arbitrary farm indefinitely. |
| Node count hard cap | 24 existing nodes | No node creation or relocation; keep existing id/type/kind/distance. Worlds generated with fewer nodes retain only those. |
| Per-type active source cap | 256 units *at most* | 8 nodes×32 in normal 24-node maps; actual effective limit is 32×actual nodes of that type. |
| World active source cap | 768 units *at most* | 24×32; actual effective cap is 32×existing node count, **no reservations added**. |
| Eligible placement | Original surface coordinates, 6..36 cardinal steps from real entrance, distinct from any portal, ≥5 Manhattan tile spacing | Same meaningful travel envelope as source generation; apply fresh reachability validation before every refill. |
| Epoch journal retention | Last 512 event summaries plus lifetime per-type counters and rolling digest | Memory-bounded historical diagnostics; aggregate older records before dropping, never drop their counts. Not a persistent audit store. |

**Potential flow:** Per 200 ticks, at most (12+6+12)=30 new **external** units may enter the world. Over 3600 ticks: at most 18 events → carbs 216, protein 108, water 216, sum **540** units. Over 12,000 ticks: 60 events → at most carbs 720, protein 360, water 720 (sum 1800). These are **upper bounds**, not forecasts: full nodes, blockages or depleted budgets can produce less, including zero. No backlog is accrued or later paid as a lump sum.

**Approximate 30-worker steady-state:** carbs nominal ~3.65/100 versus proposed source inflow max 6/100; water ~2.38 versus 6/100; protein brood rate ~1.11 versus 3/100, plus construction. These calculations do NOT prove survival: measured transit, full storage, worker deaths, pathfinding, forager slots and queen maturity may prevent delivery. **100 workers:** carbs nominal ~11.88/100 exceeds ecology max 6/100 even under perfect transport. This intentionally requires later upgrades/strategic population management; do not promise unlimited growth.

### Deterministic event algorithm (future code contract, not implemented)

1. Maintain ecology.tickCount incremented **only** inside the Game fixed simulation pipeline. At positive multiples of 200, process precisely one epoch. Do not depend on real Date/Math.random, render frames, camera, UI, or wall time. Ideally place Ecology.tick before Foraging.tick so a same-tick refill can first be reserved, not consumed or credited remotely.
2. Compute reachability by one reachablePaths(surface, portal.surface) per event; do not call findPath for every node/worker. Verify that portal is traversable. If missing, journal zero delta for the event; retry only at next epoch. No surface writes.
3. Enumerate the **existing** source nodes, validate unique id/coordinates/type, cardinal BFS distance in [6,36], surface walkable, not entrance/portal and spacing ≥5. Skip invalid or disconnected nodes. Only pre-existing positions can refill. Do not create a new node or choose a location based on the number of workers.
4. For each type independently, assign budget (carbs 12/protein 6/water 12) in integer units across eligible nodes. Use a **seed + epoch + type + stable node ID derived** ordering (e.g., tileHash or a pure 32-bit mixing function with fixed salts), with stable lexicographic ID tie-break. Allocate fairly: one unit to each eligible node per pass, then repeat until budget exhausted or all nodes full. This avoids an always-first-node hotspot and makes sequence deterministic. Zero capacity consumes zero budget.
5. Before each increment compute free = 32 - node.amount; require nonnegative safe integers and node.reserved ≤ node.amount. Atomically increase node.amount by delta≤free; record that exact positive delta in an immutable event journal and lifetime inflow[type] in the **same mutation boundary**. No changes to node.initialAmount or node.reserved. If validation fails, reject the transaction without writing a partial event and surface an error; never silently repair mismatches by minting stock.
6. On completed event update epochIndex, lastAppliedTick, per-type lifetime inflow, bounded journal and digest. Duplicate calls for the same simulation tick are no-ops; skipped events do not catch up via a giant burst. If an engine resumes with missing historical ticks via a future save-load implementation, require explicit ordered replay/migration rather than on-the-fly minting.
7. Do **not** alter Foraging.beginTrip, gather, portal, cargo, Rooms.depositAt, Lifecycle.consume, Rooms.cancel or Combat.killWorker in Stage 1. Replenishment only increases valid physical node.amount. Existing reservation claims remain unchanged and outstanding.
8. Preserve accounting when material is in blocked/disabled warehouses: still counted as physical stock but not available for consumption. Renewable source inflow never bypasses these restrictions.

The policy does not spawn new objects, so **node identity and reservation references remain stable**. Refill of a reserved source increases available unreserved amount, never the reservation itself; a worker cannot automatically harvest more than its reservation.

## 5. Source ledger, ownership and mass-balance contract

Resources are independently conserved for each t∈{carbs, protein, water}. Define:

- **S0[t]** = sum of immutable initialAmount for all source nodes of type t.
- **J[t]** = cumulative **explicit external ecology inflow** successfully journaled onto nodes of type t. No inflow before first renewal; finite mode always J=0.
- **X[t]** = explicitly journaled test/debug/fixture injections; **production X must equal zero** absent an authorized separate feature. Do not use Rooms.syncInventory as a source of X.
- **S[t]** = current physical amounts across surface nodes.
- **R[t]** = node reservations (subset of S), not additive; source reserves and individual worker claims must match.
- **C[t]** = food/water actually in workers' forage cargo (including wait-storage/returning cargo).
- **W[t]** = sum of physical room stocks. Foraging.inventory[t] **must equal W[t]**, and **must not** be counted again on the equation's right side.
- **H[t]** = Rooms.held[t], material withdrawn from W but still in construction pickups/carriers/ground recovery.
- **P[t]** = Rooms.spent[t], final construction material sink.
- **U[t]** = Lifecycle.consumed[t], nutrition sink.
- **L[t]** = Lifecycle.lost[t], carried resources lost through worker death.
- **Z[t]** = any future explicitly journaled sink (default zero; forbidden in Stage 1 without documented approval).

**Per-type conservation at every fixed tick:**

~~~text
S0[t] + J[t] + X[t]
  = S[t] + C[t] + W[t] + H[t] + P[t] + U[t] + L[t] + Z[t]

0 <= sum(worker.reservedAmount for node n) == n.reserved <= n.amount <= 32
W[t] == foraging.inventory[t] == sum(room.stock[t])
all fields >= 0 and Number.isSafeInteger(field)
~~~

The source refund/carry transitions must be **zero-sum internally**:

~~~text
reservation:        R += q, while S remains unchanged; not a physical ledger transfer
reservation release:R -= q; S remains unchanged
gather:             S -= q, C += q, R -= reserved q, exactly once
deposit:            C -= q, W += q, exactly once and only after physical warehouse arrival
consume:            W -= q, U += q
reserve construction: W -= q, H += q
finish construction: H -= q, P += q
cancel construction: H -= q, W += q, exactly once
forager death:       C -= q, L += q; outstanding R releases, S unchanged
ecology refill:      J += q, S += q, same atomic journaled event, q <= event/node caps
portal/reroute/idle: physical sums unchanged
~~~

**Hard behavior invariants / anti-exploit:**

1. Source inventory remains an integer and reservation totals equal live worker claims; exactly one successful pickup per unit reserved; stale/dead workers cannot harvest or release another worker's claim. A concurrent refill does not modify worker cargo, reservation or existing delivered stock.
2. No instantaneous inventory/nutrition credit from source replenishment, deposit attempt, passing a portal or starting a trip. Warehouse delivery requires actual reachable ready storage and sufficient capacity.
3. No duplicate refund from cancel/complete/reroute or worker death during construction; held/pickups do not count twice. A blocked/disconnected storage room remains in W but cannot be silently consumed or credited; reconnecting does not generate stock.
4. Starvation/thirst and brood-related protein starvation use exactly the existing lifecycle mechanisms. Under zero protein, no egg laying or larva promotion for lack of protein; there is no free worker spawn or hidden protein income.
5. Enemy deaths and natural deaths must use the existing reservation/cargo/ledger cleanup; no duplicate ownership or orphan cargo.
6. Reset by new Game(seed,policy) generates **fresh** S0, nodes, workers, journal, counters, epoch and pending reservations. Two independent new games with identical seed, policy and action sequence produce identical snapshots; changing view/zoom must not perturb RNG.
7. No system may manipulate reserved to fix amount beyond caps, nor silently alter initialAmount to hide J. Proposed debug commands altering stock must record X explicitly in fixture-specific ledgers or be rejected in production.
8. All counters and node stocks must remain nonnegative finite safe integers, per-type caps and per-world caps must hold; verify mass after event and after every destructive transition in deterministic tests.

**Journal shape (proposal):**

~~~js
world.ecology = {
  schemaVersion: 1,
  mode: "renewable", seed: world.seed,
  tickCount: 0, epochIndex: 0, lastAppliedTick: 0,
  nextEventTick: 200,
  cumulativeInflow: {carbs:0,protein:0,water:0},
  archivedInflow: {carbs:0,protein:0,water:0},
  archiveDigest: 0, journal: [
    {epoch:1,tick:200,kind:"EXTERNAL_ECOLOGY_INFLOW",
     deltas:[{nodeId:"resource-7",type:"carbs",before:16,delta:2,after:18}],
     totals:{carbs:2,protein:0,water:0}}
  ]
};
~~~

State is **conceptual**, not a claim of existing API. Event journal may retain the last 512 **events**, aggregate older event sums in archivedInflow plus an ordered rolling digest; cumulativeInflow is the authoritative full-session total (archive + retained events). Journal event records include even 0-inflow epochs with a reason (e.g. all nodes full / portal disconnected). Use one transaction per epoch, sorted node deltas, no partial writes. Immutable node.initialAmount denotes initial world stock only.

**RNG plan:** Use a stateless integer mixing function (e.g. fixed tileHash salts) of immutable seed, epoch, type and node ID. **No shared mutable game RNG state is consumed**, so combat RNG cannot perturb ecology and UI randomness cannot affect results. Persist epochIndex and lastAppliedTick as authority. If a mutable generator is chosen instead by HEAD, its exact uint32 state, draw count, event ordering and version MUST be persisted and replay-tested.

**Save/load migration (future R5, not Stage 1):** v1 worlds without ecology fields import mode=finite, J=0, epochIndex=0; do not retroactively refill historic ticks. Renewable schema saves same source nodes/reservations and ecological clock/journal/account counters atomically with Game tick. A loaded save with mismatched S0+J+X vs physical ledger is rejected/flagged, never auto-repaired by crediting inventory. Versioned migration must cover retained journals and counter precision. At this stage no persistence exists.

## 6. Preserve existing tests without weakening assertions

- Keep Game(seed) in existing source-level tests **finite by default**, so ECO-01..12, U3.7 source exhaustion and older fixed-mass tests still assert S0+X equals physical buckets. In finite mode J stays zero even at >3600 ticks.
- Introduce **explicit Game(seed, {ecologyPolicy:"renewable"})** (proposed exact signature) for all new renewable tests and real-game browser entry. The browser must apply the same policy to initial construction and reset/new seed, otherwise reset silently switches economy modes.
- New renewable audit extends the unchanged ECO sum with +J. Do not rewrite, delete, skip, lower assertion frequency, change expected values, or exclude old finite tests. The ledger is not permitted to backfill S0/initialAmount. New external fixtures must count X separately, not forge J.
- Required additive cases (future): identical-seed 3-way repeatability; x1/x2/x4 same number of fixed ticks; pause at tick 199/200; independent types and integer budget; no-op when full; node cap and world cap; invalid portal/terrain skip; reserved node refill while worker en route; simultaneous harvest/refill epoch; claim cleanup on forager death; zero-stock renewable only becomes positive through journaled event; no store credit before delivery; cargo death; full store; disconnected store and repair; cancellation once; combat death; no new node/portal placement; mass audit per step; world reset; 12k+ tick stress.
- Keep ECO-01..12 at their original inputs and code; run both old suite and new renewable suite. Be explicit that old tests are finite-mode compatibility and **not sufficient** to certify renewal. A new browser smoke must confirm that the real game, not only unit fixtures, selects renewable mode.

## 7. Deterministic 30-game-minute test matrix and long-run validation

**Clock conversion (exact code constants):** 1 tick = 0.3 game minute, therefore **30 game minutes = 100 fixed ticks**; x1 ≈10 s real wall-time for 100 ticks at nominal 10 TPS, x2/x4 faster, subject to runtime scheduling. **One game day = 4,800 ticks**. 12,000 ticks = 2.5 game days; 18,000 ticks = 3.75 game days and intersects natural worker-age death at 18,000 ticks. These are simulated time calculations, not benchmarks.

**Base matrix:** Three fixed world seeds: ANT-001, R4-ECO-02, R4-ECO-03. Three initial worker counts **5, 30, 100**, with forager allocations **0/1/2/4** = **36 world/scenario combinations**. Each runs two distinct 100-tick windows: fresh ticks **0→100** (no inflow event) and **150→250** (exactly one event at tick 200), with identical inputs across speed modes where supported. That is **72 windows ×100 = 7,200 observed ticks**, plus 150 setup ticks for the epoch-crossing independent worlds: **5,400 warmup ticks** if windows are simulated as separate fixtures. Use explicit real allocation mechanisms for labour when practical; for synthetic preseeded 30/100-worker fixtures, label injected workers and keep the nutrition ledger unaffected. Starting 100 workers is a stress fixture, not a claim of attainable early-game growth.

**Expected classifications for each worker count × forager selection, not unmeasured numeric results:**

| Starting workers | 0 foragers | 1 forager | 2 foragers | 4 foragers |
|---|---|---|---|---|
| 5 | **Temporary survival, long-run starvation** from empty stores; J may accumulate in sources but no delivery | **Supply bottleneck risk**; inspect per-type shortages and queen | **Baseline viable candidate**; target queen alive and nonnegative ledger in endurance | **Baseline viable candidate**; capped stocks, wasted excess inflow rather than minting |
| 30 | **Long-run starvation** | **Likely delivery-limited**; report shortages, not a guaranteed threshold | **Borderline delivery-limited**; measure feed/transport balance | **Target viable candidate** pending measured travel, warehouse and brood throughput |
| 100 | **Long-run starvation** | **Unsustainable** | **Unsustainable** | **Unsustainable at proposed carbs max** (6/100 ticks vs nominal ~11.88/100); managed attrition is intended |

At the 100-tick observation horizon, **“survival” means only queen alive and population snapshot**, NOT proven sustainability: starve thresholds are thousands of ticks. For **every** matrix cell, hard expected outputs are journaled per-event inflow ≤ per-type budget, S0+J+X equals all physical/sink buckets **every tick**, reservations ≤ source amount, no inventory credit without physical delivery, and no impossible worker/room state. Expected demand-limited/unsustainable categories apply at the longer endurance checkpoint, not as an assertion that an ant must die during 100 ticks.

**Adversarial fixtures and expected classification (run on all three seeds, minimum 100-tick window crossing tick 200, then selected 12k-tick endurance):**

| Scenario | Stimulus | Exact expected contract |
|---|---|---|
| Full storage | Fill real room stocks to actual caps, at least one loaded forager | No capacity overrun; worker waits with actual cargo; renewable source additions may saturate to node caps; **no nutrition credit or auto deposit**. |
| No protein for queen | Explicitly exhaust delivered protein, retain sources/allow valid renew | No new egg from protein-free warehouse; larvae cannot promote without protein; only later physical protein delivery unlocks reproduction; conservation unchanged. |
| Pause at event boundary | Reach tick 199, pause 1000 wall-time updates; resume x1/x2/x4 to 200 | No event during pause; one event at 200, no duplication after rapid toggles; same final state for equal tick counts. |
| Loaded worker killed | Kill after gather but before warehouse deposit | Cargo decreases exactly by q, lost increases q, no inventory change; source was already decremented once; reservation cleaned. |
| Reserved worker killed | Kill while to-source | Reserved decreases exactly, source amount does not decrease; a different worker may reserve later. |
| Blocked source/portal | Fault-inject rock/impassable surface or disable portal at epoch boundary | Invalid/unreachable nodes gain **0**; no relocation to blocked/water/stone/thicket/portal; unresolved cargo follows existing safe return/error policy, not teleport. Synthetic only. |
| Disconnected underground store | Block its connecting tunnel; later restore | Room remains physically stocked but inaccessible; no consumption or deposit into disabled room; reconnect restores permission, **not stock**. |
| Construction cancellation | Reserve real materials then cancel once and again | First refunds exactly held q, second no-op; J untouched, no phantom resources. |
| Combat/enemy death | Trigger real soldier/worker casualty path while carrying or assigned | Kill cleanup reconciles inventory, cargo, lost, reservations exactly once; no new resources. |
| World restart | Same seed+policy rebuilt / different seed rebuilt | Fresh S0, J=0, journal empty, epoch=0, no carried references or stale claims; deterministic for same seed and action script. |

**Extended endurance / balance gate:** At minimum three seeds × (5 workers/2 foragers, 30/4, 100/4, 30/0) = **12 runs**, each **12,000 ticks** = **144,000 total simulated ticks**; sample at ticks 100, 200, 600, 1800, 3600, 4800, 7200, 9600 and 12000. Add one **18,000-tick** (3.75-day) run per seed for natural-age/brood replacement effects, with explicit notes when population shifts because of the existing age limit. A failed survival objective is a **balance outcome**, not automatically a conservation failure; any nonzero conservation error or duplicate reservation is an unconditional failure.

**Candidate acceptance targets to be calibrated by actual measured playtest, NOT claimed pass:**

- Conservation and deterministic correctness: **0 violations** over all short and long scenarios, across all three resource types, all checked ticks.
- Three-seed same-action reproducibility: byte-identical logical snapshots at matched tick boundaries; identical ecology inflow counters across speed modes by tick, not necessarily identical screenshot timestamps.
- Practical **5 workers / 2 foragers**: target queen alive through 12k ticks, at least one delivered unit of each type, recurring physical deliveries and no artificially added stock. If failure occurs, measure travel bottlenecks before increasing budgets.
- Practical **30 workers / 4 foragers**: target queen alive and ≥50% of starting workforce at 12k; identify capacity, starvation or worker-age effects separately. This is a **provisional balance KPI**, not a promise; revise only after evidence.
- **100 workers / 4 foragers**: model openly classifies resource-insufficient (carbs 6/100 max), not an endless-survival target; failures must be starvation via valid ledger/death, never negative stock or teleport.
- 0-forager, no initially delivered inventory: eventually nutrition failure under current life rules while source stock may accumulate up to caps. Full-store scenarios: cargo retained, never discarded or overflowed silently.
- Spawn integrity: 100% renewable additions into existing safe reachable nodes; exactly 0 new source IDs/positions, invalid tile refills, nonphysical consumption, or duplicate journal epochs.

**Measurements needed from an actual runner/playable browser before freezing constants:** initial stock by seed and type, actual count of source nodes, mean/p95 round-trip ticks by type/distance, pickup and delivery rates/100 ticks, foragers utilization, current room capacity/occupancy, stockouts per type, queen hunger/thirst, care wait and brood survival, deaths (natural/combat), worker age distribution, renewable attempted/accepted/unallocated budgets, tick-time p50/p95 and memory over long run. Do not invent metrics. Capture screenshots/HUD state only after design is implemented; report NOT_RUN today.

## 8. Complexity, performance and event ordering

- **Current map:** 128×128 surface = 16,384 cells; underground 96×64 = 6,144 cells (src/world/generate.js L9-L11).
- The proposed event algorithm performs one BFS on the surface every **200 simulation ticks** (~0.05 BFS/s at 10 TPS), scans at most **24 existing nodes**, hashes/sorts up to 24 node IDs per type and allocates at most 30 integer units/event. Big-O: **O(W×H + N log N + budget)** per epoch, N≤24, budget≤30; between events O(1).
- Do not call findPath per refill or per node on each tick. Cache eligible node coordinates from world generation but **revalidate reachability at each epoch** to handle future terrain mutations and forced tests. No new pathfinding in ordinary foraging code.
- The pre-existing Rooms.updateConnectivity L194-L206 performs a BFS per room per tick and may dominate p95 at 100 workers/32 rooms. Profile this separately, do NOT change it in R4 Stage 1. Recording its cost is measurement, not a mandate to optimize unrelated code.
- Determinism requires stable ordering of production systems: ecology before foraging, then existing colony/foraging/rooms/lifecycle/combat order maintained relative to each other. Paused speed 0 yields no ecology tick, no RNG progression or ledger mutation. Equal cumulative fixed tick steps yield equal economy states at x1/x2/x4.
- Ensure event processing is strictly once per epoch with idempotence key (schemaVersion, seed, epochIndex), and that journal totals equal the actual sum of node deltas. Atomic validation prevents partial epochs on exceptions.
- Recording per-tick audit snapshots in tests is allowed; do not ship O(workers×nodes) invariant scans in every production tick. Validate event invariants at event boundary; comprehensive scans in test runner.

## 9. Dependency & risk register

| Risk/dependency | Severity | Mitigation/required HEAD action |
|---|---|---|
| Old finite-stock tests break under default renewable | High | Preserve Game(seed) finite default; opt-in browser to renewable later; add tests rather than change ECO-01..12. |
| Food instantly credited on refill | Critical | Ecology mutates only source.amount plus matching external journal J; no warehouse/cargo writes. |
| Hidden mint via syncInventory fixture path | High | Treat mirror reconciliation as legacy/debug-only; production never calls with unauthorized aggregate deltas. Future stricter validation is **separate scope**. |
| Rates insufficient or excessive at 30/100 workers | High | Declare numbers PROPOSED; measure 12k-tick delivery & consumption; tune only against explicit head-approved KPIs. |
| Malformed/spoofed resource nodes | High | Validate id, type, position, caps and reachability; reject epoch atomically, no silent mint. |
| Reservation/refill race | High | Ecology first in fixed single-thread pipeline; source amount increase never changes reserved; log exact event. |
| Surface terrain closed / disconnected | Medium | One epoch BFS and skip invalid locations; preserve existing physical worker behavior; add fault-injection tests. |
| 24 nodes at 32 cap accumulate unusable stock | Intended design limit | Budget expires if no free slots, no catch-up banks and no free delivery. |
| 30-minute window too short for starvation/renewal | High methodology | Cross the first tick-200 epoch and include 12k/18k endurance; do not label 100-tick survival “sustainable.” |
| Room connectivity BFS p95 at large pop | Performance risk | Measure but keep out of exact Stage-1 allowlist. |
| Save/load not implemented | Compatibility | New worlds only; define schema v1, future migration forbids hidden catch-up mint. |
| Concurrent R2 combat/UI work | Integration | No edits until HEAD assigns disjoint Stage-1 paths and checks current main; rebase design if needed. |

## 10. Proposed separate Stage-1 implementation contract (requires new HEAD issue)

**Proposed exact file allowlist; no approval conveyed by this document:**

1. CREATE src/core/ecology.js — external inflow policy, deterministic refill scheduler, event journal, validation and counters.
2. MODIFY src/core/game.js — optional constructor policy and ecology subsystem inserted as first fixed-tick step; finite default. No change to existing relative subsystem ordering.
3. MODIFY src/main.js — when HEAD authorizes real gameplay activation, select renewable policy for both initial Game and reset callback; no UI overhaul.
4. CREATE tests/ecology-renewable.test.mjs — additive stress, 100-tick window matrix, long-run invariants, deterministic snapshots, policy separation.

**Read-only in Stage 1:** src/core/foraging.js, lifecycle.js, rooms.js, combat.js, colony.js, src/world/resources.js, generate.js, navigation.js, renderer/UI/CSS, existing tests, workflows, readme and other docs unless HEAD explicitly revises the allowlist. Stage 1 reuses existing nodes and delivery/consumption. If required bug fixes cross this list, stop for a separate scope decision instead of patching silently.

**Acceptance gate checklist:**

- [ ] HEAD approves/revises rates, finite-legacy policy, browser activation, exact paths, and event order **before implementation**.
- [ ] All existing unchanged tests ECO-01..12, U3 lifecycle, U4, U5, R2 path/combat run with actual exits and remain green under finite mode; do not claim PASS without logs.
- [ ] Additive renewable tests prove J-based conservation every tick; count budgets/caps/reservations/cargo and physical deliveries under adversarial conditions.
- [ ] Three-seed repeatability and pause/x1/x2/x4 same-tick invariance; zero journal divergence.
- [ ] 36-cell ×2-window 30-game-minute matrix, 12k-tick endurance and 18k age-check evaluated with documented seeds, snapshots, exceptions and EXIT codes.
- [ ] Measured 5/30/100-worker population viability and bottlenecks with proposed KPI outcomes explicitly PASS/FAIL/NEEDS_TUNING, not invented.
- [ ] Performance p50/p95 and memory measured; no per-tick source pathfinding or uncontrolled node/journal growth.
- [ ] npm test, npm run build and relevant browser smoke actually executed on candidate SHA; distinguish CI/local/browser/aws; HEAD reviews only after results.
- [ ] No Stage-1 code merged through this **Stage-0 design PR**; future implementation on a fresh branch/new Issue with separate review.

## 11. Stage-0 evidence and requested decision

This is a read-only audit of live source at the pinned main and an **unexecuted design**. No local source runtime, npm tests, build, benchmark, browser QA or game-session balance measurement was run. Proposed values and acceptance KPI targets are **hypotheses pending implementation measurements**.

**Requested AI-HEAD decision:** accept Alternative A and proposed staged opt-in implementation with explicit inflow ledger as the technical baseline; or request targeted revisions to the budget, 30-minute/long-run validation matrix, policy compatibility and future exact file allowlist before creating an implementation Issue. **AI-1 must not implement this plan without a new scope grant.**
