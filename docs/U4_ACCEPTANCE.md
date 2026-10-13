# U4 Acceptance — Colony Lifecycle

## Implemented scope

- Real adult population starts at one queen and five workers. The queen lays eggs only if **delivered** protein stock is available. A brood slot is occupied separately from adult population.
- Eggs mature into larvae, then pupae and adult workers after explicit elapsed simulation ticks; larval advancement requires one more protein and active nursery care. Each new adult receives a never-reused worker ID, joins the shared AI roster, and can work, forage, or nurse.
- Nursery workforce allocation (default 1) may be adjusted independently of foraging allocation. Nurses are selected from available idle, non-foraging workers and physically walk through reachable underground tunnels to the queen's chamber. Without care, larvae stall and eventually die.
- Per-adult hunger, thirst and age are ticked by the fixed simulation clock. Adults consume carbohydrates and water only when resources have been deposited. Without food and water they eventually die. Workers and the queen also have maximum simulated ages.
- Worker death cleans up digging assignments, source reservations and nursery roles; carried food is accounted for as lost rather than duplicated or magically teleported. Queen death stops reproduction.
- New brood visuals at the queen chamber; compact brood HUD; adjustable nursery allocation; click/tap the population badge to open a detailed report, with birth/death totals and food consumption. The report closes without obscuring the map permanently.
- Existing fixed-step clock, dig queue, two layers, foraging reservations, seed reset, map tools, UI and Amplify deployment configuration are preserved.

## Resource accounting

For every resource type, at all times:

`initial surface source amount = remaining source amount + worker cargo + storage inventory + consumed inventory + lost cargo`

Production does not create resources. The queen pays one protein to lay each egg, and one additional protein is needed for larva-to-pupa transition. The U3 conservation tests have been updated to include `consumed` and `lost`, rather than disabling the checks.

## Quality gates

- [x] 36 Node tests passed: 5 U1, 9 U2, 9 U3, 13 U4.
- [x] U4 browser UI smoke tests on Chromium desktop 1440×900, portrait 390×844, landscape 844×390, with no JavaScript console errors or horizontal page overflow.
- [x] Repeated U2 and U3 browser regression checks across the same three viewports.
- [x] Builds successfully with `npm run build` and contains the U4 lifecycle module in `dist`.
- [x] Pause freezes brood, hunger and worker movement. x4 accelerates the simulation without skipping inventory accounting.
- [x] 5,000-tick conservation and pathfinding checks; no resource creation or walking through solid tiles.
- [x] Death during digging/foraging returns assignments and releases reservations.
- [x] Nursery allocation zero stalls development and prolonged lack of care results in brood loss.
- [x] The same seed and identical actions reproduce the same simulation and a new world resets lifecycle totals.

## Deliberate scope limits

- Food storage room capacity, humidity and specialized nursery construction are U5.
- Combat and enemy attacks are U6; rain, ecological supply renewal and environmental temperature are U7.
- Save/load is U8. The present lifecycle state is not persisted over a browser reload.
- Browser smoke testing in this sandbox uses an inline copy of source ES modules due to loopback browser restrictions. The live AWS Amplify deployment remains unverified here.
- Balance values are first-playable tuning constants in `LIFE`, not claims of biologically accurate real-world timing.
