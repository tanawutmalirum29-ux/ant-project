# NURSERY–CASTE V1: Integration Contract

Status: **Implementation requested by OWNER (2026-10-15)**. This contract coordinates three non-overlapping coding tracks. Existing game `main` remains playable until integrated PRs pass review/CI.

## Authoritative requirements
- Existing `Nursery` is the only hatch room. A room must be completed, ready and connected before accepting an egg order.
- Slot count is `min(room.width * room.height,16)` (2×2 = 4; never free baseline). Every pending order occupies one unique *real tile slot* immediately; capacity includes queue / laid / carried / incubating.
- Player picks a specific Nursery, profession and level 1–5. Exactly five permanent professions: `miner`, `forager`, `builder`, `nurse`, `soldier`. Five initial workers are `starter` generalists, not soldiers by default (no automatic conscription).
- Unique order ID and state transitions: `QUEUED -> LAID -> AWAITING_PICKUP -> CARRYING -> INCUBATING -> HATCHED`, with optional `WAITING_ROUTE` while no path. Queen lays **one order per 180 simulation ticks**, only on a reachable free physical tile near queen. Queen death cancels QUEUED orders; already laid brood can finish if otherwise viable.
- Nurses physically pick up and carry eggs to their pre-reserved Nursery tile; no teleport. Carrier death leaves egg at the physical tile and does **not** release its reservation.
- Hatch age advances **only after delivery in a ready connected Nursery**; disconnect pauses without changing age. Egg/larva/pupa share total ticks `[440,560,720,900,1140]` by level, with baseline proportions 100/180/160; larva care and feeding remain real. Preserve separate travel/queue wait.
- Entry reservation is atomic across all needed resources; record `heldEgg`, `eggSpent` and original sourceRoomId/pickups. Only `QUEUED` cancellation refunds exactly once, to original stock; inaccessible depots are not silently redistributed. **Do not** create resources or credit an unconnected depot as spendable.
- Population including alive queen + alive adults + laid brood + queued orders <= 150, with a single reservation transferred from order to brood at LAID. No duplicate hatches.
- Existing physical construction costs, forage storage, paths, enemy AI, and A/B squads remain functional. No save/load and no new room type.
- Mobile 320px: Nursery drawer is CSS-based, keyboard/touch accessible, no native alert/confirm, doesn't obscure squad A/B controls.

## Shared JavaScript API contract (must coordinate across tracks)
1. `game.lifecycle.queueEgg(roomId,profession,level)` returns `{ok:boolean,reason:string,order?:object}`. Validate all arguments and all stock/slot/population preconditions **before** any mutation.
2. `game.lifecycle.cancelEgg(orderId)` returns `boolean`, true only when a QUEUED order was cancelled and refunded.
3. `game.lifecycle.eggOrders` is a stable array of active order records with at least `id,roomId,profession,level,status,slot,x,y,hatchTicks,remainingTicks` (x/y only when physically laid). `game.lifecycle.nurseryStatus(roomId)` returns `{slots,used,free,orders}` or null for unknown/non-nursery.
4. Persist `ant.profession` as `starter|miner|forager|builder|nurse|soldier` and `ant.level` as integer 1–5. Preserve `ant.caste='worker'` for rendering/game legacy semantics; do not repurpose it. All five starting workers: `profession:'starter',level:1`. A new soldier must have `combatRole:'soldier',squadId:'A'` and be automatically enlisted by combat logic.
5. `game.lifecycle.eggCost(profession,level)` returns immutable/new per-order `{carbs,protein}` or null if invalid. **Candidate initial numbers for playable bootstrap, subject to QA:** Lv1 `miner:{carbs:1,protein:1}`, `forager:{carbs:1,protein:1}`, `builder:{carbs:2,protein:1}`, `nurse:{carbs:1,protein:2}`, `soldier:{carbs:2,protein:3}`. Multiply each number by level; production path must have one source of truth and may be rebalanced only if tests justify.
6. Level bonuses: Miner dig time reduction (bounded); Forager carry units levels 1–5 `[3,3,4,4,5]`; Builder bounded room construction speed; Nurse care contribution increases and still services one brood at a time; Soldier HP/damage rise gradually from Lv1 16 HP / 4 damage. Keep actual paths and stored cargo.
7. Permanent-caste scheduler priority: specialist performs its own work first; starters can perform all civilian roles; only bounded emergency civilian fallback if corresponding specialist count is zero. Soldiers never auto-convert to civilians and never become eligible to forage/dig/build/nurse. No percentage scheduler may rewrite roles.
8. `game.workforce` may retain legacy methods temporarily for compatibility, but `reconcile()` must not reassign fixed professions/recruit soldiers; UI replaces old percentage sliders **when replacement is working**.
9. `Nursery` has `broodSlots=min(area,16)` in new rules, and capacity counts reservations. Any test written for obsolete auto-laying or 18+area×2 free capacity must migrate, while unrelated regressions are preserved.

## Exclusive edit ownership
- **Track A · Hatch Engine:** `src/core/lifecycle.js`, `src/core/rooms.js`, `src/core/egg-config.js` (if needed), `tests/nursery-hatching.test.mjs`. Do **not** edit `game.js`, `colony.js`, `foraging.js`, `combat.js` or UI.
- **Track B · Profession Schedulers:** `src/core/colony.js`, `src/core/foraging.js`, `src/core/combat.js`, `src/core/game.js`, `tests/nursery-professions.test.mjs`, legacy `tests/workforce-percentage.test.mjs` as needed. Do **not** edit files assigned to A or C.
- **Track C · UI:** `index.html`, `src/ui/app.js`, `src/ui/ant-inspector.js`, `src/ui/visual/nursery.css`, `tests/nursery-ui.test.mjs`, `tools/browser-nursery.py` (optional). Do **not** edit core files.
- **Coordinator (this ChatGPT session):** integration review, legacy test migration across unowned tests, CI, cross-system acceptance, merge to main when proven safe. Agents must only open PRs to `main`; no direct code push to `main`.

## Acceptance gates
1. Bootstrap from a new seed: initial five starters gather food, mine, build 2×2 Nursery, queue and physically hatch first specialist without injected stock.
2. All 25 profession × level combinations: born exactly once with requested role and stats, correct work eligibility, squad A for soldiers.
3. Correct slot overbooking refusal 5th order at 2×2 / >16 for oversized room; no accepted order on disconnected or unfinished room.
4. Full physical egg pickup/delivery, pause/resume on disconnection, carrier death recovery, queen death state reconciliation.
5. Conservation: simultaneous reservations, cancellation replay, concurrent construction, disconnected source, worker death. No negatives/phantom resources.
6. Soldier A/B protection/formation and no draft conversion; 150 population and long-run 5,000 ticks without leaks; Pause/x1/x2/x4 determinism.
7. Native Node tests + production build + real-browser checks in Chromium at 320px and desktop, including excavation, forage, construction, combat, inspector and drawer overlap.
8. Every PR reports exact commit SHA and test results. Failures block merge until fixed.

This is a coordination/specification change only. It does not assert that implementation or QA is complete.
