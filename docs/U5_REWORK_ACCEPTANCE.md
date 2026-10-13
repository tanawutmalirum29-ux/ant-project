# U5 Rework — Spatial logistics and physical room effects

## Defect report (from the previous U5)

1. **Warehouse was cosmetic for routing:** stock capacity increased but every forager returned to the queen's tile for instant credit. Additional store positions made no difference to actual transport distance.
2. **Nursery was cosmetic for relocation:** added brood capacity but care was always administered at the queen's location; eggs never moved to a finished nursery.
3. **Construction had no material collection trip:** queued work debited inventory numerically, and a worker went straight to the build footprint.
4. **Guard preparation had no observable U5 behavior:** a completed guard room did nothing until future U6 combat.
5. **Inspection lacked per-room stock/care occupancy and location-sensitive placement feedback.**

## Fixed in this rework

- Storage is tracked **per physical room** (`room.stock`), and existing `foraging.inventory` remains the legacy **aggregate**. Warehouse type and connection restrict which resource types and quantities are accepted. `depositAt` requires the worker to stand on a completed, connected warehouse footprint; `deliveryTarget` computes reachable grid paths to the candidate warehouses. An arrival at the nest entrance or queen tile alone does not credit stock. If one store is full, a worker moves to a different reachable store; if none has capacity it holds the cargo.
- Active warehouses expand real reachable storage capacity, while disabled or disconnected warehouses retain existing contents but cannot accept new deposits or supply consumption. A game tick updates connectivity. The food-seeking policy considers available space in **active storage rooms**, not only nominal global capacity.
- Material purchases reserve delivered stock by source depot; builders must walk to each pickup location (one or more source warehouses), collect supplies, walk to the planned room and work for multiple ticks. Death drops the builder's collected reserved materials at the ant's **actual tile**; the replacement builder walks there. Cancellation remains an instant order rollback/refund (see limits).
- A queen lays eggs in the queen chamber; a nursery is used only after real construction. Nurses physically pick up brood, carry each brood item through walkable corridors to a ready nursery, then care for larvae at their real tile. Brood has spatial `x/y/roomId/carrierId` information; new workers are born at the brood tile. Dropped brood stays at the last worker location on nurse death or reassignment.
- Guard-preparation room now stations one worker for a **real route patrol** between the guard room and entrance whenever urgent dig/build/nurse jobs do not require the worker. The guard is reassigned when higher-priority work appears. No combat AI is implied.
- A building ghost shows the real 2×2 intended footprint (green if valid / red if invalid), and room inspection shows per-room contents, outstanding pickups, nursery occupancy and guard assignments. Original DOM IDs and core U1–U4 game controls are preserved.

## QA performed on local checkout

- `npm test` **59/59 passed**: 51 earlier U1–U5 tests (with two expectation updates to reflect real travel) plus 8 spatial logistics regression tests.
- `npm run build` success. **Local V1 CSS was a temporary placeholder** in this checkout because the existing original V1 asset was not mounted; the actual GitHub main V1 stylesheet is unchanged. On GitHub CI, the real V1 and merged V2 files need to be verified in place.
- `python tools/browser-smoke.py` U2: 3/3 viewport passes.
- `python tools/browser-u3.py` U3: 3/3 viewport passes.
- `python tools/browser-u4.py` U4: 3/3 viewport passes.
- `python tools/browser-u5.py` U5 room controls: 5/5 viewport passes.
- `python tools/browser-u5-logistics.py` U5 spatial stock/real worker arrival: 5/5 viewport passes.
- No uncaught JavaScript page errors observed in these runs. Browser tests inline ES modules due to the isolated Chromium sandbox; they do not establish actual live AWS behavior.
- Long-running mass-conservation tests still check resources on the surface, in transit, consumed/lost, in stock, or reserved/spent on construction; no created material.

## Known functional limitations; do not represent as completed

- Stock is spatially separated **by room**, not by every individual chamber tile. Food consumption by adults and the queen is a connected-inventory debit, rather than every ant physically collecting its own meal. Physical feeding logistics and per-item storage are still to be designed.
- Cancelling construction is a reversible inventory reservation rollback: stock is refunded to its originating store without a physical return trip. Full reverse-hauling / abandoned materials is not implemented.
- A completed nursery holds at most eight transferred brood items under the new relocation rule, while the existing base brood capacity remains at the queen chamber. Brood nutrition still debits connected store inventory; no dedicated protein-carrying nursery deliveries yet.
- Guard patrols are **noncombat**; enemies, alert logic, injuries, and defense bonuses remain U6.
- World is not persistent across reload (U8), and no remote AWS deployment or actual mobile phone has been validated here.

## Collaboration / ownership

This branch changes only gameplay-owned paths: `src/core/**`, `src/render/renderer.js`, `src/ui/app.js`, `src/main.js`, gameplay test files, this report and the new U5 Chromium smoke script. No V2-owned files, `src/ui/visual/v1.css`, `src/ui/visual/v2.css`, artwork, production HTML or deployment files were modified. Review and integrate on a dedicated PR; avoid overwriting other agent work.
