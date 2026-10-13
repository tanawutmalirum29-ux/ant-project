# AI-1 — Round 04: Sustainable Colony Economy design

**Task:** R4-ECO-DESIGN-01 (design only) / Issue #35  
**Status:** DESIGN READY FOR AI-HEAD REVIEW — NOT IMPLEMENTED  
**Date:** 2026-10-13, Asia/Bangkok (UTC+7)  
**Branch:** plan/r4-ai1-sustainable-ecology  
**Branch creation base (verified main at kickoff):** 3a5c7a93ac3a0f22f2c5a72d60ad9884adad9c65  
**Current main after concurrent AI-2 integration:** 504378726d0dabe432d48887340e388f7486ad43; its changed paths are combat.js, formation-dynamic tests, and AI-2 Round-02 report, not R4 ecology. HEAD should verify the latest main at review.  
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/36  
**Live issue report:** https://github.com/tanawutmalirum29-ux/ant-project/issues/35  
**Design document:** https://github.com/tanawutmalirum29-ux/ant-project/blob/plan/r4-ai1-sustainable-ecology/docs/development/R4_ECOLOGY_DESIGN.md  
**Final head SHA:** read the latest PR/branch SHA; Issue #35 final submission records it after this report commit.

## Scope verification

Only **two new documentation files** are permitted and authored:

- A docs/development/R4_ECOLOGY_DESIGN.md
- A docs/ai-reports/AI-1/ROUND_04.md

No production code, tests, workflows, UI, README, old Round-02 report or main branch changed by AI-1 in this task. No merge authorization.

## Source reviewed (read-only)

- src/world/resources.js: deterministic 24 existing reachable surface nodes; finite 16..32 amounts; no replenishment.
- src/world/generate.js, src/world/navigation.js: map/seed, portal, surface walkability and cardinal BFS.
- src/core/foraging.js: reservations, real pick-ups, 3-unit cargo, physical portal travel and warehouse delivery.
- src/core/lifecycle.js: protein-funded egg/larva cycle, adult hunger/thirst, aging/death and lost-cargo accounting.
- src/core/rooms.js: warehouse caps, physical stock, held/spent construction materials, idempotent refunds, disconnected stores and inventory mirror.
- src/core/game.js, src/core/time.js, src/core/random.js, src/main.js: fixed-tick order, seed, x1/x2/x4, pause, world creation/reset.
- src/core/combat.js: natural enemy threat/death interaction (read-only and subject to concurrent R2 changes).
- src/core/colony.js: worker identities and forager slots (known from completed R2-SIM-01, source unchanged here).
- tests/economy-accounting.audit.test.mjs, tests/foraging.test.mjs, tests/lifecycle.test.mjs, tests/room-logistics.test.mjs: finite conservation and regression behavior; no modifications.
- docs/GAME_SYSTEMS.md and docs/development/ROUND_02_ROADMAP.md: conservation baseline and R4 design-first policy.

Relevant exact source paths and function/line ranges are cited in the proposal itself.

## Completed design

1. Traced actual source→reservation→cargo→warehouse→nutrition/construction/loss flow, including room stock alias and physical held-material sinks.
2. Compared two options: (A) bounded deterministic refill of existing nodes; (B) seasonal growth/migrating sources, with operational and exploit risks. **Recommend A.**
3. Proposed per-200-fixed-tick seed-stable renewal of up to carbs 12, protein 6, water 12 units, **all PROPOSED/NOT MEASURED**, node cap 32, no more than 24 existing nodes, active source caps max256/type and max768/world. All accepted deltas require external ecology journal; no direct store credit.
4. Specified per-type strict equation S0 + external J + explicit test X = S + cargo + physical store + held + spent + consumed + lost (+ any separately authorized sink). Node reservation is a claim, not extra stock. Documented atomic events, overflow bounds, idempotence, seed/epoch selection and fresh reset.
5. Protected ECO-01..12 and U3.7 with legacy Game(seed) finite default; new opt-in renewable policy and additive tests; browser chooses renewable only after separately approved implementation.
6. Designed three-seed × 5/30/100 workers × 0/1/2/4 foragers, 2 ×100-tick observation windows, and 12k/18k-tick endurance; full-store, no-protein, pause, death, construction, blocked/repair and combat matrix. Differentiated eventual survival projections from tested performance.
7. Proposed separate Stage-1 exact allowlist: CREATE src/core/ecology.js, MODIFY src/core/game.js and src/main.js, CREATE tests/ecology-renewable.test.mjs; no gameplay work authorized by this PR.
8. Included complexity bound one surface BFS/200 ticks (128×128), bounded node and journal sizes, with Rooms.updateConnectivity BFS identified as **pre-existing** performance risk outside this task.

## Test/build evidence (required honesty)

| Item | Status | Actual exit code / counts | Explanation |
|---|---|---|---|
| Source inspection | COMPLETE — read only | Not a runtime result | GitHub connector retrieved current source/docs/tests |
| npm test | **NOT_RUN — design only** | No exit / PASS or FAIL numbers | No executable source changes |
| npm run build | **NOT_RUN — design only** | No exit / PASS or FAIL numbers | Not attempted |
| node --test tests/economy-accounting.audit.test.mjs | **NOT_RUN — design only** | No exit / PASS or FAIL numbers | Existing ECO-01..12 not edited |
| Browser and AWS | **NOT_RUN — design only** | No artifacts | Not an implementation/QA task |
| Live balancing / performance benchmark | **NOT_RUN — design only** | No measured survival or timing metrics | All proposals explicitly hypotheses |

No full-tests PASS, sustainable-population claim, browser sign-off, or implementation is asserted. Production behavior remains unchanged by this PR.

## Dependencies, risks and requested decision

- **Must approve before implementation:** policy default/opt-in browser activation; 200-tick schedule and proposed 12/6/12 budgets; max source caps; no-teleport/no-free-food invariant; Stage-1 allowlist.
- **Key risks:** existing finite tests and source depletion assumptions, 100-worker unsustainable food budget, low forager delivery rates, overloaded/disconnected storage, stale reservations, large room BFS cost, and later save-state migration.
- **Acceptance:** zero ledger discrepancy; deterministic equal-tick snapshots; no node/portal spawning; initialAmount immutable; old finite tests unchanged, new renewable tests additive; proper 100-tick+long-run real test evidence before deployment.
- **Owner decisions requested:** none. **AI-HEAD decisions requested:** approve/revise Alternative A; authorize a separate implementation Issue with exact paths, then coordinate integration and actual tests.

## Handoff

**Status:** DESIGN READY; Draft PR #36 remains unmerged for HEAD review. AI-1 must not implement Stage 1 or modify old R2 branches without fresh AI-HEAD authorization.

**Copyable pointer:** AI-1 | R4-ECO-DESIGN-01 | DESIGN READY | Issue #35 | Draft PR #36 | branch plan/r4-ai1-sustainable-ecology | HEAD please review economy model, journal contract, finite legacy policy, proposed rates and future Stage-1 allowlist. Final branch SHA in Issue #35 submission.
