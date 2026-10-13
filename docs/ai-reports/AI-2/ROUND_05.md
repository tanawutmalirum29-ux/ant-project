# AI-2 — Round 05: Simulation Performance Profiling DESIGN REPORT

**Task:** R5-PERF-DESIGN-01 · Issue #37  
**Date/time:** 2026-10-13, Asia/Bangkok (UTC+7)  
**AI role:** AI-2 / Performance Technical Design  
**Status:** DESIGN DOCUMENT COMMITTED — AWAITING AI-HEAD REVIEW; NO IMPLEMENTATION  
**Verified main base at branch creation:** 504378726d0dabe432d48887340e388f7486ad43  
**Branch:** plan/r5-ai2-performance-profiling  
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/38 — OPEN / DRAFT / UNMERGED  
**Full plan:** [R5_PERFORMANCE_PROFILING_PLAN.md](../../development/R5_PERFORMANCE_PROFILING_PLAN.md)

## Authority and scope

R2-COMBAT-01 PR #30 and old formation branch are closed/untouched. This issue authorizes **design and read-only source review only**, not code, tests or performance instrumentation. The only new files committed on the R5 branch are:

1. docs/development/R5_PERFORMANCE_PROFILING_PLAN.md — technical design, benchmark specification, top-two proposals, quality gates.
2. docs/ai-reports/AI-2/ROUND_05.md — personal delivery and evidence report.

**No production code, existing tests, UI, workflows or main branch were modified.** No self-merge.

## Source inspection actually performed

Inspected current-main source and implementation from GitHub Connector (not remembered behavior):

- src/core/game.js, time.js — fixed timestep, ordering and pause/speed semantics.
- src/core/rooms.js — updateConnectivity/reachable/validate, pickWorkSite/assign, builder progress, stock and rest/guard worker selection.
- src/world/navigation.js, generate.js — cardinal A*/BFS arrays, terrain writes, map sizes, portals.
- src/core/colony.js — chooseOrder, job ownership, completed dig topology.
- src/core/foraging.js — source selection, reserved quantities, delivery target and travel states.
- src/core/lifecycle.js — brood/nurse path calls, material consumption and death.
- src/core/combat.js — R2 Formation C cache invalidation, soldier and enemy movement, HP and threats.
- src/render/renderer.js, camera.js, src/main.js — camera bounds, visible tile rendering, DOM and rendering cadence.
- src/ui/app.js, combat-controls.js — HUD and roster refresh selectors and cadence.
- docs/GAME_SYSTEMS.md — persisted rules and mass-conservation invariants.
- tests/gameplay-allocation.audit.test.mjs, colony-path-guard.test.mjs, economy-accounting.audit.test.mjs, formation-dynamic.test.mjs, combat.test.mjs and relevant existing GitHub workflows/browser U6 script — **read-only inspection**, no tests run.

## Findings (source-inferred; no benchmark measurements)

**Highest structural suspicion:** Rooms.tick currently invokes updateConnectivity once each tick, which invokes reachablePaths once **per room**, creating a fresh underground BFS for each. One 96×64 connectivity search constructs three 6,144-entry Int32Arrays (72 KiB) even before JS overhead. At 16 rooms the arithmetic implies 1.125 MiB of TypedArray storage allocation per tick from this pattern; **calculated allocation size is not measured RSS, heap, GC or runtime**.

**Other source-level suspects:** Rooms.assign/pickWorkSite repeats footprint A* per candidate; Colony.chooseOrder performs one reachablePaths plus job scan per idle worker on a retry tick; the render loop draws visible tiles each animation frame and a room preview invokes Rooms.validate/reachablePaths each frame; foraging, nurses and HUD/roster have additional repeated scans. Combat.ensureFormation already caches geometry and portal reachability on relevant state changes; no evidence warrants reworking it before profiling.

**High correctness risk:** cross-tick memoization without a complete mutation contract. Colony.completed covers successful ordinary dig writes, **not** direct writeCell, room stock/build states, queen death, worker ownership, formation roster, camera or world reset. Rooms currently refreshes connectivity each tick. Top candidate therefore proposes a single **per-tick** shared queen BFS, keeping cross-tick safety and the original room status transitions.

## Proposed profiling matrix

| Dimension | Scenarios | Caveat |
|---|---|---|
| Workers | 5, 30, 100, 150 | 150 WORKERS is synthetic stress; natural maxPopulation=150 includes queen/brood |
| Total rooms | 1, 8, 16, 32 | Must validate walkable connected fixtures and real room readiness |
| Queued digs | 0, 1, 20 | Verify queue acceptance and job ownership |
| Combat interactions | 0, 10, 100 cumulative | Max 5 simultaneous enemies; 100 means scripted interactions over time |
| Speeds | 0, 1, 2, 4 | Pause has no executed tick; report per call only |
| Seeds | >=3 | Record exact names and world/fixture fingerprints |
| State | cold/warm; low/high foraging/building/rally/retreat | Rebuild independent identical fixtures per replicate |
| Browser | Canvas disabled/active, HUD/roster off/on, room preview | Node CPU is distinct from real Chromium FPS |

30 in-game minutes = 100 fixed ticks (0.3 in-game minute/tick); speed x1/x2/x4 scheduling uses 100/50/25 update(100) calls nominally. Capture p50/p95/p99/mean/max ns/tick, allocation and heap/external/arrayBuffers/RSS, counts of findPath/reachablePaths/ensureFormation rebuilds, real command exit codes and per-tick baseline/optimized replay snapshots. Cross-product of required worker/room/dig/interaction/speed/3-seed dimensions = **1,728** scenario-seed combinations; propose screening then targeted deep runs, and mark infeasible fixtures explicitly. Existing test data is **not** R5 performance data.

## Ranked proposed next steps — recommendations only

**P1 / AI-2 initial owner:** per-tick queen-connected BFS reuse in src/core/rooms.js, reducing one-per-room traversals to one per Rooms.tick; no cross-tick memo initially, preserve disconnected rooms and inventory/build semantics.

**P2 / AI-1 tentative owner, pending HEAD allocation:** deduplicate identical-origin idle-worker reachability within Colony.tick and preserve chooseOrder stable job priority/ownership in src/core/colony.js.

Both paths remain mutually exclusive for concurrent owners. More risky Rooms.pickWorkSite A* simplification is deferred until after P1; UI/Renderer proposals deferred to a separately assigned UI agent. No Stage-1 file permissions exist yet.

**Proposed future gates (not measured):** measurable >=20% p95 improvement in target hotspot (across 3 seeds), no >5% overall p95 regression or >20% peak RSS increase, no job/mass/movement/HP/portal/formation/clock snapshot divergence, existing unit + U5/U6 browser regressions pass, physical-device measurements before claiming mobile FPS. Threshold values require HEAD freeze before actual benchmark execution.

## Actual commands, results, and limitations

| Command / action | Actual status and exit code | Explanation |
|---|---|---|
| Fetch Issue #37 and inspect main branch SHA through GitHub Connector | SUCCESS (API call; shell exit N/A) | Read-only source inspected at 504378726d0dabe432d48887340e388f7486ad43 |
| Read source, existing tests and workflows through GitHub Connector | SUCCESS (API call; shell exit N/A) | Pure static review |
| Create new planning branch and design file(s) via GitHub Connector | SUCCESS (API call; shell exit N/A) | Two allowed docs only |
| node --test / npm test | **NOT_RUN (exit N/A)** | Stage 0 design only; no test claim |
| npm run build | **NOT_RUN (exit N/A)** | Stage 0 design only; no build claim |
| Node 22 microbench, heap/GC profiler, Chromium FPS, phone trace | **NOT_RUN (exit N/A)** | Only a future measurement design exists |
| Baseline vs optimized replay | **NOT_RUN (exit N/A)** | No optimized implementation exists |
| CI performance quality gate | **NOT_RUN / NOT_DEFINED** | Must be created only with HEAD permission |

**Actual measured R5 samples: 0. PASS/FAIL performance classification: NOT_TESTED.** A successful GitHub file upload is **not** a benchmark pass. The prior R2 reported 152/152 gameplay tests and browser smoke are historical functional gates only.

## Deliverable and AI-HEAD decisions requested

- Review the [complete performance design](../../development/R5_PERFORMANCE_PROFILING_PLAN.md) for faithful cost models, workload feasibility, threshold proposals and topology/stock/roster invalidation.
- Approve **measurement/instrumentation scope first**, including which future tools/tests/artifact paths are writable and CI resource budget; do not start optimization based solely on source intuition.
- Decide P1/P2 lead and avoid any overlapping production-file grants with AI-1/AI-3.
- Keep Draft PR unmerged until HEAD's explicit technical review. Report to HEAD through Issue #37.

**Outstanding measurement:** all R5 latency, p95, heap, allocations, FPS, benchmark performance verdict and low-power-device impact. These are intentionally unverified.
