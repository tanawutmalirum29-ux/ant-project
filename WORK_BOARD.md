# Ant Kingdom — Parallel Development Work Board

Repository: https://github.com/tanawutmalirum29-ux/ant-project
Default integration branch: main. This document describes intended responsibilities, not a guarantee that an agent is currently executing.

## Baseline at work split
- Gameplay phases U1 / U2 / U3 / U4: merged and accepted.
- Visual phase V1 Compact HUD: merged in main; stylesheet src/ui/visual/v1.css stays intact.
- **U5** Rooms & Economy: planned, gameplay owner AI-A.
- **V2** UI/UX & Graphics: planned, visual owner AI-B.
- U6–U8: backlog. Start only after U5 gates.

## Parallel lanes

| Lane | Responsible agent | Branch | Owns | Must not modify |
| --- | --- | --- | --- | --- |
| A: Gameplay | AI-A (gameplay agent) | feature/u5-rooms-economy | src/core/**, src/world/**, gameplay tests, gameplay UI wiring in src/main.js + src/ui/app.js, renderer integration, docs/U5_ACCEPTANCE.md | V2 assets, src/ui/visual/v2.css, design/v2/** |
| B: Visual | AI-B (visual agent) | visual/v2-art-ui | src/ui/visual/v2.css, src/render/visual/**, assets/ui/**, assets/sprites/**, design/v2/**, docs/V2_ACCEPTANCE.md, new visual-only tests | src/core/**, src/world/**, src/ui/app.js, index.html, src/main.js, src/styles.css, src/render/renderer.js, src/ui/visual/v1.css, existing tests/build/deploy config |
| C: Integration | Gameplay owner after review | integration/u5-v2 (optional) | Deliberately load v2.css, opt-in art hooks, final production UI checks | Must not alter simulation rules to accommodate cosmetic assets without separate U5 change |

**Shared file policy:** No simultaneous edits of index.html, src/main.js, src/ui/app.js, src/styles.css, src/render/renderer.js, README.md, package.json, .github/**, tools/build.mjs. AI-A is integration owner. AI-B asks for a narrow interface request in its PR instead of editing them.

## Work breakdown and handoffs

### A — U5 Rooms & Economy (seven steps)
1. U5.1: room data model, types, validation, layout and reserved room cells.
2. U5.2: orders that require reachable worker travel and construction progress.
3. U5.3: functional queen, nursery, food store, water store, worker-rest and guard-preparation rooms, with no premature U6 combat.
4. U5.4: storage capacity per resource and safe delivery/backpressure with existing forager AI.
5. U5.5: accessibility and connectivity after digs; invalid/disconnected rooms cannot function.
6. U5.6: production room controls and compact economy/room data views without breaking existing controls.
7. U5.7: U1–U5 regression, resource conservation, rendering and mobile smoke tests; create U5 acceptance report.

### B — V2 UI/UX & Graphics (five steps)
1. V2.1: visual audit of V1, coherent palette/type/spacing/touch targets; screenshot baseline.
2. V2.2: original SVG icons and 2D ant/brood/room/resource assets, with documented scale/atlas metadata.
3. V2.3: non-invasive CSS skin overrides in **new** v2.css; do not rename IDs or restructure production DOM.
4. V2.4: standalone responsive prototype in design/v2/; before/after comparison 320x568, 390x844, 768x1024, 844x390, 1440x900.
5. V2.5: visual tests, contrast/visibility/performance review, screenshots, acceptance notes, PR with explicit integration requests.

### Integration — ONLY after both deliverables reviewed
1. Merge U5 after its test gates (or merge isolated V2 assets first only if non-activating).
2. Rebase the remaining branch onto latest main and check changed paths.
3. Gameplay owner connects V2 assets and adds v2.css link in index.html, verifying stylesheet order: styles.css → v1.css → v2.css.
4. Verify UI events, hit targets, U5 room data, U1–U4 regression, browser, build, deployment assets.
5. Merge integration PR only when both owners' boundaries and tests pass.

## Rules for parallel work
- Never fix unrelated bugs. Report them in the PR or a GitHub Issue with steps to reproduce.
- Each agent is responsible for repeated testing before submitting work.
- No independent merging of both branches into main without sequencing and retesting.
- A failed test blocks merge; a test assertion invalidated by new legitimate gameplay needs a clearly documented update, never deletion to hide failure.
- Preserve history: no force-push over other agents, no resetting main.
- No promised runtime speed/FPS without measuring it.

## Next milestones
- U5 gameplay PR: room construction, capacity, accessibility, no loss/duplication.
- V2 visual PR: assets, skin and isolated prototype with no live wiring.
- Combined verification PR: U5 + V2 production integration and sign-off.
