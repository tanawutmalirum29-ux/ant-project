# U5 — Rooms & Economy Work Order (AI-A)

## Current state
Game: https://github.com/tanawutmalirum29-ux/ant-project
Merged: U1–U4 + V1 Compact HUD. U5 not started by the creation of this plan.

AI-A owns the real game mechanics. Work on new branch feature/u5-rooms-economy from current main AFTER this coordination document is merged. Read AGENTS.md and WORK_BOARD.md first. AI-B concurrently works only on isolated visual V2 deliverables.

## Gameplay ownership / allowed files
- src/core/**, src/world/** and dedicated new gameplay modules
- src/ui/app.js, src/main.js, index.html, src/styles.css, src/render/renderer.js ONLY as necessary to integrate U5 systems and controls
- tests/rooms.test.mjs, tests/economy.test.mjs, new gameplay browser smoke tools, docs/U5_ACCEPTANCE.md
- Existing U1–U4 test assertions only if legitimately invalidated; explain why and keep equivalent coverage.

Avoid editing any V2 paths: src/ui/visual/v2.css, src/render/visual/**, assets/ui/**, assets/sprites/**, design/v2/**, docs/V2_ACCEPTANCE.md, tests/v2-visual.test.mjs. Preserve src/ui/visual/v1.css exactly unless explicitly coordinated.

## Planned room design
- U5.1 **Room catalog/model:** queen chamber (starting functional room), nursery, food storage, water storage, worker rest, guard preparation. Stable IDs, status (planned / building / ready / disabled), footprint, owning colony, connected flag and build cost. Do not implement U6 combat.
- U5.2 **Placement and worker construction:** selection of reachable underground cleared/tunnel area, validation against solid terrain, entrances, blocked walls and overlap. Workers must travel to a reachable work site and spend ticks building; no instant free build.
- U5.3 **Room effects:** queen chamber anchors queen actions; nursery supports brood care; stores increase actual stock capacity; rest station is a logistics/idle anchor; guard room may be preparatory only with clearly labeled U6 dependency.
- U5.4 **Economy and storage:** replace U3 temporary stockLimit=9999 with tested per-resource storage capacities; preserve inventory conservation. Forager deliveries must handle full warehouses deterministically, without duplication, negative inventory, silent loss or irreversible stuck workers. Ensure U4 consuming inventory and the queen's protein costs still work.
- U5.5 **Connectivity:** room function requires a reachable connection to the living underground colony. Construction jobs recover/requeue when topology changes. Never grant benefits to disconnected or unfinished rooms.
- U5.6 **User controls:** room picker, place/cancel orders, compact room status/economy info. Preserve existing dig/inspect tools, selection, time controls, two map layers, seed reset and population panel. Match V1 compact pattern and mobile safe areas.
- U5.7 **Testing:** room footprint/overlap, connectivity, task assignment, cancellation, incomplete room, stock full, capacity transitions, consumption, forage reservations, brood, pause/time, seeded resets and U1–U4 regressions.

## Design contract for U5 to expose later to AI-B assets
The final names are determined by implementation; document the final public read-only adapter, not writable direct references. Suggested contract:
- game.rooms or game.roomSystem, with stable room ID, type, state, tile footprint, build progress, reachable/connected
- economy summary exposing per-type stored / capacity / net rate in plain numbers
- selection UI class hooks prefixed room-, with existing IDs unchanged
- renderer drawing room tiles from model state, with optional later art adapter
Do not create fake new resource types unless in scope. Visual-only AI-B may use mock U5 room data but cannot edit runtime files.

## Acceptance gates (no skipping)
1. Gameplay-driven construction and no instant room completion.
2. Workers cannot walk through soil/rock, get trapped indefinitely, duplicate jobs or teleport rooms.
3. Room inventory math balances; totals for each type account for source + cargo + storage + consumed + lost, and room construction resource costs if they come from those resources.
4. Existing ants can still dig, forage, nurse, reproduce, age and die.
5. New Seed resets rooms, jobs and resource caps cleanly; pause freezes construction.
6. npm test, npm run build and U2/U3/U4/U5 browser smoke on desktop 1440×900, portrait 390×844 and landscape 844×390.
7. Tests and report distinguish verified pass from unverified live AWS Amplify and physical phone.

## PR delivery
- PR title: U5 Rooms & Economy; base main.
- Include exact files changed, tests and their result counts, reproducer for any out-of-scope defect, screenshots of construction/warehouse states, performance observations.
- Do NOT merge until compared against latest main and tested; no force-push.
- Do not integrate V2 early: integrating visual assets is a separate sequential task after the two branches are reviewed.
