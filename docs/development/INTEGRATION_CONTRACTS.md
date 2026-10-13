# Integration Contracts — actual source interfaces, Phase 0
Baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237. These are observed APIs, NOT promises that untested runtime already passed.

## Composition and time
new Game(seed='ANT-001') constructs world, colony, foraging, lifecycle, rooms, combat, stepper, metrics. Constructor wires foraging.rooms, lifecycle.rooms, rooms.lifecycle. Game.update(realDeltaMs) returns count of executed fixed ticks; Game.setSpeed(0|1|2|4) changes simulation speed. Simulation update call sequence: colony.tick() → foraging.tick() → rooms.tick() → lifecycle.tick() → combat.tick(), then pending metrics. UI/render consumes Game and NEVER creates a second tick loop. Game.toggleLayer()/setLayer('surface'|'underground') preserve world state.

## World, movement and portals
createWorld(seed) returns {seed,seedLabel,entrances:[{id,surface:{x,y},underground:{x,y}}],layers:{surface,underground}}. cellAt invalid -> null; writeCell mutates terrain. world/navigation.js exports isWalkable, isDiggable, findPath (array of cardinal points or null), reachablePaths (distance/path), DIRECTIONS. Ant {id,caste,layer,x,y,facing,next,motion,path,orderId,state}; only one owner may move a given ant in a tick. A valid movement step changes Manhattan distance by 1 on its current layer. Cross-layer coordinate relocation is legal ONLY at a matching portal. No movement during pause.

## Colony / jobs / role contracts
Colony.workers is the canonical mutable array; workers never duplicated by recruiting; queen is separate. queueRectangle({x,y},{x,y}) -> {added,existing,blocked,limit}; cancel(x,y) boolean; getOrder(x,y); pendingCount, forageSlots, isForager(ant), setForageSlots(integer). Dig ownership via job.id, job.workerId, ant.orderId; at most one live ant per order. Current isForager derives last N array entries; preserve/explicitly redesign with approval before persistent caste changes. Any worker death should free relevant work owner and active reservations.

## Resource ledger
world.resources entries {id,type,x,y,amount,initialAmount,reserved}. Types carbs/protein/water. Foraging.inventory aggregates delivered units, foraging.nodes refers to world.resources; worker.cargo may hold {type,amount}. Foraging.releaseReservation(ant) unlocks node reservation; resetAnt clears cargo. Rooms contains storage room stock and held/spent accounting. Rooms.syncInventory currently reconciles external inventory injections; production code must not use this as a shortcut to create units. rooms.capacityFor(type), storageSlots(type), deliveryTarget(type,ant), depositAt(ant,type,quantity,roomId), take(type,amount), reserveMaterials(cost). Physical deposit requires matching layer, reachable room footprint and ready status. Reservation is NOT stock or source mass. Invariant per resource type at each tick:
sum(node.initialAmount) + explicit injected units = sum(node.amount) + sum(worker cargo amounts) + foraging.inventory[type] + lifecycle.consumed[type] + lifecycle.lost[type] + rooms.held[type] + rooms.spent[type].
When explicitly initializing stock via test injection, include it in injected units; never count a reservation twice. If room stock and aggregate disagree in normal play, fail and investigate instead of silently rebasing the baseline.

## Room and lifecycle contracts
ROOM_CATALOG room types queen/nursery/food_store/water_store/rest/guard. Rooms.validate(type,x,y) -> {ok,reason}; Rooms.queue -> {ok,reason,room}; Rooms.cancel(roomId) -> boolean. Room status planned/building/ready/disabled, connected boolean; complete, connected rooms only grant capacity. Rooms.onWorkerDeath recovers pickups and frees builder.
Lifecycle.brood contains stage egg/larva/pupa plus positions/care; Lifecycle.consume(type,amount) books consumption; Lifecycle.killWorker(ant) returns boolean and performs cleanup; nurseSlots and setNurseSlots adjust nursing. Worker birth through promote() mutates Colony.workers. Source death and room-builder death scenarios require explicit ledger assertions.

## Combat contracts
Combat.soldierSlots intended desired count; Combat.soldiers derives subset via worker.combatRole==='soldier'. canRecruit(a), recruit(a), demobilize(a), setSoldierSlots(n); setMode('defend'|'rally'|'retreat'); setRally(layer,x,y) -> boolean; raiseAlarm(), spawn(type,layer,x,y); getters ralliedCount, threatCount, availableRecruits. Combat must not take an ant with active mining/foraging/nursing/building or uncompleted cargo without an approved transition protocol. Rally is presently one shared destination, with per-soldier formation offsets, not multiple independent squads. Combat can remove workers by calling Lifecycle.killWorker.

## UI/render & interfaces
UI(game,cameras,renderer,onNewWorld) owns tool, selection, camera input, rendering view state; UI.mapTapHandler can be installed by CombatControls. Preserve DOM control IDs in index.html as tests reference them; maintain existing #room-type select as authoritative gameplay selection (src/ui/visual/room-picker.js is a visual adapter). UI refresh and combat roster should read current new Game after seed reset. Rendering receives Game/camera/selection, paints tiles and entities only; no inventory mutation. Responsive interactions must be evaluated at 320×568, 390×844, 768×1024, 844×390 and 1440×900.

## Compatibility protocol
For each proposed interface change: provide BEFORE signature + AFTER signature, producer/consumer modules, migration sequencing, default behavior, error behavior, 2-player-visible test scenarios, 2 edge cases and rollback path. HEAD approves coordinated changes, freezes exact allowlists, then sequences PRs. No other AI changes a shared contract spec independently.
