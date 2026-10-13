# Ant Kingdom — System Audit (Phase 0)
Date: 2026-10-13 (Asia/Bangkok) | Audited baseline: d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237
Source: GitHub connector, full main tree, README.md, docs/GAME_SYSTEMS.md, core/world/UI/render files, tests and workflow configuration.
IMPORTANT: This is a SOURCE-LEVEL audit, NOT a successfully executed full runtime audit. git clone was blocked by network/DNS; npm test, npm run build and Playwright were NOT executed locally by AI-HEAD. GitHub Actions API returned 0 main-branch runs and 0 commit statuses at the time of inspection; this does not assert historical jobs never ran. AWS Amplify/real-phone status: NOT VERIFIED.

## Status taxonomy
1 = real behavior executed and checked on this exact SHA; 2 = implementation exists but runtime not verified this audit; 3 = partially implemented/known functional limitation; 4 = reproducible defect with concrete run evidence; 5 = absent.
**No row has status 1 or 4 from this Phase-0 remote audit**: reading source/tests cannot substitute for executing them. A finding must be promoted to 4 only after a repeatable script and actual failure artifacts, and to 1 after repeatable pass evidence.

| Domain | Status | Code evidence and qualification |
|---|---|---|
| Initialization/game composition | 2 | src/main.js constructs Game; src/core/game.js wires Colony→Foraging→Rooms→Lifecycle→Combat; fixed tick update |
| Clock, speed, pause | 2 | src/core/time.js; 100ms tick, speeds 0/1/2/4; tests/foundation.test.mjs |
| Deterministic seed/world/portal | 2 | src/world/generate.js: 128×128 surface, 96×64 underground, paired portal; world/resources.js seeded |
| Pathfinding and digging | 2 | src/world/navigation.js A*/BFS, src/core/colony.js distinct orders, tiles carved after work ticks |
| Resource gather, surface travel, return | 2 | src/core/foraging.js reservations/cargo; test cases U3.* |
| Warehouses/room construction | 2 | src/core/rooms.js 2×2 footprint, held/spent materials and physical pickup; U5.* and U5R.* tests |
| Brood, nursing, food/water needs | 2 | src/core/lifecycle.js eggs→larvae→pupae→worker, explicit consumption/death accounting |
| Soldier recruitment, rally, threats | 2 | src/core/combat.js and src/ui/combat-controls.js; U6.* tests |
| Rendering/camera/UI events | 2 | src/render/*, src/ui/app.js, src/ui/visual/* and index.html; tests and browser scripts exist |
| Browser viewport compatibility | 2 | tools/browser-u6.py and browser-v2-ui-fix.py define 320×568, 390×844, 768×1024, 844×390, 1440×900; not rerun |
| High-population performance | 3 | Sim supports maxPopulation=150; no verified benchmark with 50/100/150 ants at current SHA |
| Ant crowding/traffic collision | 5 | nav uses walkable terrain; no ant-to-ant occupancy rules (documented limitation) |
| Per-ant physical eating visits | 3 | src/core/lifecycle.js consumes pooled warehouse stock without ant path-to-pantry |
| Physical refund transport | 3 | src/core/rooms.js cancellation directly restores stock, documented approximation |
| Separate independent army squads | 5 | src/core/combat.js one mode/rally, one soldier list |
| Durable save/load | 5 | UI world reset instantiates a new Game; no save serialization/persistence |
| Renewable long-term sources | 5 | src/world/resources.js finite source amounts; no respawn in code, long-term sustainability to design |
| Build/deploy readiness | 2 | package.json test/build scripts, tools/build.mjs dist=index.html+src, amplify.yml test→build; no current successful run evidence |
| AWS production and physical devices | 2 | deployment docs/config exist; no production URL/device signoff captured |

## Architecture — interaction and ownership
Game tick order is Colony, Foraging, Rooms, Lifecycle, Combat (src/core/game.js); one tick is 100ms. Renderer in requestAnimationFrame does not own mutations. Layer toggle only changes game.layer; world and clock objects persist. New seed replaces the Game object (expected reset). One physical entrance connects the layers. Only valid cardinal walkable tiles may be traversed; portals are explicit exceptions.
- Colony chooses digs for idle NON-foragers; isForager(ant) means membership in the last forageSlots entries of colony.workers, not a persistent role tag.
- Foraging chooses sources based on stock+carried totals, reserves nodes, moves via entrance, and deposits only in ready reachable storage; cargo is lost and counted in Lifecycle.lost on worker death.
- Rooms reserves stock before construction, books held/spent quantities, requires clear connected footprints and visits to pickup/build sites; connectivity is recomputed each tick.
- Lifecycle owns nurse assignment, hunger/thirst, age, brood and worker removal; killWorker releases dig ownership, source reservations, room builder supplies and carried cargo.
- Combat recruits eligible idle/room-rest/room-guard underground non-foragers; soldiers are a subset of workers, not extra population. The Combat pass runs after the other systems.
- UI reads Game state; src/ui/combat-controls.js dynamically creates a tactical dock/dialog and consumes UI.mapTapHandler. Camera/render are per-layer and world-state persists when switching layers.

## Evidence-backed *risks to test*, NOT asserted defects
- RISK-A1 P0/P1: src/core/colony.js derives forager membership from worker array indices. Birth/death reindex membership; src/core/combat.js recruitment changes availability. Execute transitions with in-flight carry and brood, then assert assignments and ledger remain consistent. Avoid silently changing roles while material is held.
- RISK-A2 P1: src/core/rooms.js updateConnectivity() loops every room and reachable() runs a full BFS per room every tick, including connected rooms. Benchmark with 1/8/16/32 rooms; optimize only if measured.
- RISK-A3 P1: src/core/combat.js getRallyGoal() runs findPath for formation candidates; ralliedCount computes destinations repeatedly. Formation offsets have 13 entries. Test 2, 13, 14+ soldiers, blocked map cells, target on surface and rapid rally changes; do not assume uniqueness beyond tested size.
- RISK-A4 P1: physically reserved construction materials and source cargo are different ledgers. Test deaths while fetching, multiple queued rooms, cancellation after topology loss, disabled stores and consumption under shortage. src/core/rooms.js has explicit test-injection reconciliation through syncInventory; never infer conserved mass from aggregate stock alone.
- RISK-A5 P2: sources are finite and do not respawn. Determine intentional survival-loop duration before adding regenerative sources.
- RISK-A6 P1: src/ui/visual/v1.css, v2.css, v2-fixes.css and combat.css layer on top of styles.css. Existing browser tests target five layouts, but real browser/phone accessibility, OS zoom and overlays require new evidence.
- RISK-A7 P1: moving/resting/nursing/digging/foraging/soldier states share one ant.state string; state transitions from one subsystem can affect eligibility of another. Establish a transition matrix and fuzz around death/reassignment/portal.
- RISK-A8 P2: render work culls tiles to viewport; drawing all matching ants/enemies and repeated route computations require measurements at zoom extremes with 150 ants.

## Current testing evidence
Source shows 11 tests/*.test.mjs files (foundation, digging, foraging, lifecycle, rooms, room-logistics, combat, V1/V2 visuals), plus tools/browser-*.py Chromium harnesses. The five workflow definitions run tests/build/browser checks only when their respective path filters match a PR, or via manual workflow_dispatch. A documentation-only PR does not automatically execute these workflows. Main protection is currently disabled. None of these facts certifies an execution PASS on the audited SHA.

## Test/reproduction evidence required to close Phase 0
1. Checkout exactly d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237; record node/npm/OS and git status.
2. Run npm test and npm run build; retain complete logs, exit codes, test counts and dist artifact checks.
3. Run existing Chromium scripts against the production index and inspect errors, exact screen sizes and screenshots.
4. Reproduce transition+conservation/performance probes for 0/5/50/100/150 workers, 1/8/16/32 rooms, plus atypical seeds; record exact seed/commands/ticks/expected/actual and script.
5. Separate local/CI/AWS/physical-phone results. Do not mark any defect confirmed without an executed repro.
6. Owner reviews go/no-go before code work affecting core gameplay.

## Source inventory read
README.md; docs/GAME_SYSTEMS.md; docs/AMPLIFY_DEPLOY.md; package.json; amplify.yml; src/main.js; index.html; core/{game,time,colony,foraging,rooms,lifecycle,combat}; world/{generate,navigation,resources}; render/{camera,renderer}; ui/{app,combat-controls,visual/room-picker,visual/page-zoom-guard}; key CSS; tests/{foundation,digging,foraging,rooms,room-logistics,lifecycle,combat}; Chromium test scripts and five workflow YAML definitions. Remaining styling assets were indexed rather than rendering-tested.
