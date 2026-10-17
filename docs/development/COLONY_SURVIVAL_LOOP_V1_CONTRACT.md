# COLONY SURVIVAL LOOP V1 — G1 FROZEN CANDIDATE CONTRACT

Mission Issue: https://github.com/tanawutmalirum29-ux/ant-project/issues/172
CEO: CEO-SURVIVAL (new organization); no inherited PROGRESSION appointments
Baseline: game `main@5191db810a0a2618bb7314889a5bcf7648b0ee5b`
Integration: `feat/colony-survival-v1-integration` → Draft PR → independently reviewed `main`
Governance: https://github.com/tanawutmalirum29-ux/appointment-CEO/blob/main/RULES.md and COMMANDS.md
Gate: **Implementation HOLD until CEO posts G1_FROZEN with this document's exact integration HEAD SHA and a fresh Engineer appointment START.**

## 1. Measured reason for scope

The G0 tests in Issue #172 used the real Game + 14 imported modules, no injected resources, synthetic workers or bypassed room construction. Three seeds survived 6,200 fixed ticks with their queen living and 26 real hatched adults by tick 6,000; a separate ANT-001 legal route survived 30,000 ticks with a living queen, 12 workers, 18 real births, all five starter workers gone by tick 18,000, first paid Research completed and 55 attackers defeated. 100-tick x1/x2/x4 replay matched, pause advanced zero ticks, and 300 spot-check resource-type conservation equations passed. Those are headless measurements, **not** npm, deployed-browser, or hardware QA.

**Root cause selection:** A sustainable physical economy and replacement generation are achievable under current constants; **repeating paid egg orders is unnecessarily manual**. Fix the control path, not unmeasured food/age/regen/queen cadence. No free supply or mass population cap increase.

## 2. Authorized scope (only one feature plus its small status UI)

**S-01: Explicit per-Nursery paid repeat order preset.** A player selects one of the existing 25 profession/level choices and deliberately enables Repeat for one Nursery. The repeat feature creates a regular paid egg order through `Lifecycle.queueEgg(roomId, profession, level)` after the preceding *auto-created* order completes and is removed. It never lays an egg directly, teleports cargo, instant-hatches an ant or bypasses care. One active auto order per Nursery, while manual orders may coexist and retain priority. Players can disable at any time. Default on fresh Game/Seed reset: disabled for all rooms.

**S-02: Minimal Nursery inline UX.** In the already existing CSS Nursery sheet, show a compact Repeat toggle/status/stop reason, bound to authoritative state and existing class/level selection. Reuse existing role+level pickers and controls; no new fullscreen overlay, dock, alert, confirm, prompt, native select, game tick loop or timer. No new milestone panel, broader UI overhaul or new Research tab.

**Explicitly excluded**: lifecycle duration/rate balancing, new source types, food pool, weather implementation, soldier AI changes, extra passive eggs, MaxPopulation change, batch orders, Save/Load, overhaul of open #137–#145/#153 UI mission, and new long-term milestone implementation. If release-critical regression evidence requires a new change, return to CEO for a *new frozen* scope before editing.

## 3. Authoritative logic / public facade (reviewed implementation semantics)

1. Maintain one repeat-plan entry keyed by **existing Nursery room ID**. Normalized serializable read-only snapshot: `{roomId, enabled, profession, level, state, activeOrderId, stopReason}`, with state `disabled | armed | waiting | paused`. The plan is not a physical stock account. `getRepeatOrder(roomId)` / `setRepeatOrder(roomId, profession, level, enabled)` expose deterministic result objects (e.g. `{ok,reason,plan}`) to the UI adapter. Do not return mutable internal objects. Invalid room/caste/Lv must leave state and stock unchanged.
2. Turning ON arms the plan without debiting resources immediately. During an advancing fixed step **after existing** `tickBrood()`, process plans in stable room-ID order. Reconcile their previous auto order ID. Only if no previous auto order remains, attempt **at most one** existing `queueEgg(...)` per plan per tick. On success, save that returned actual order ID. This is only the usual queued escrow; queen laying remains at `tickCount % LIFE.layInterval === 0`, currently 180 ticks. Manual orders from player input always get first access to slots/stock in that tick.
3. An outstanding auto order in ANY of `QUEUED/AWAITING_PICKUP/CARRYING/WAITING_ROUTE/INCUBATING` consumes the single auto slot; **never create a replacement while that order exists**. Other manually paid orders remain untouched. Loss/timeout of an auto brood must set `paused/brood-lost`, not silently purchase infinite replacement losses. A successful promotion may arm the next attempt after the old auto order is removed.
4. On insufficient stock, Nursery full/disconnected/disabled, inaccessible original depot, population cap, or dead queen, do not debit partially; mark `paused` with precise reason and stop new attempts until player explicitly resumes. The existing `queueEgg` owns validation and atomic escrow; do not clone its debit/slot logic. On queen death, disable future repeat attempts. Do not consume any further orders or mutate another Nursery's depot.
5. Turning OFF stops **future** repeat orders; it does **not** retroactively cancel/refund a paid QUEUED order. The user may explicitly use the existing `cancelEgg` on QUEUED orders, which refunds **exactly once** to every original storage room. Already-laid orders cannot be cancelled for refund. Cancelling an auto order while Repeat remains enabled should **pause** the repeat plan (`manual-cancel`) rather than silently recreate it next tick. A fresh Game/Seed reset drops all plans. Pause x0 causes no plan progress, resumption continues deterministic fixed tick order.
6. Multiple nurseries must not race for the same stock/capacity or contaminate each other's order IDs; repeat processing must be deterministic, with no mutation of `Room` capacity or of stored caste profession on an already-funded order. The existing permanent caste Lv1–5 and combat A/B remain unchanged.

## 4. Resource invariant — per type, each observed fixed tick

For each `carbs/protein/water`:

```
initial_source_units + resource_ecology.regenerated[type]
= sum(live_node.amount[type])
+ foraging.inventory[type] (= sum(physical depot stocks), COUNT ONCE)
+ sum(ant.cargo.amount for that type)
+ rooms.held[type] + rooms.spent[type]
+ lifecycle.heldEgg[type] + lifecycle.eggSpent[type]
+ research.held[type] + research.spent[type]
+ lifecycle.consumed[type] + lifecycle.lost[type]
```

Do **not** add node reservations, worker source claims, room/refund guarantees, or queued-order `cost` a second time. Per-room physical stock totals must match authoritative aggregate `inventory`. A cancel moves held mass to its exact original room stock; an egg laying moves `heldEgg` to `eggSpent`. A regeneration increment enters the equation once via the same physical existing node. Lost ant cargo and consumed larval protein count once. Run equal-mass assertions after auto queue, explicit retry, close/reopen, cancel, brood loss, reset, combat, weather changes, x0/x1/x2/x4 and long-run activity.

## 5. Files, ownership, merge safety, conflicts

- **One new ENGINEER-SURVIVAL** (to be appointed after G1_FROZEN) owns only: `src/core/lifecycle.js`; `src/ui/renovation/ui-adapter.js`; `src/ui/renovation/nursery.js`; `src/ui/renovation/nursery.css`; `tests/colony-survival-repeat.test.mjs`; optional `tests/ui-colony-survival-repeat.test.mjs`. Changes outside this list require explicit CEO Issue amendment first.
- CEO owns this contract, the integration branch/PR and conflict arbitration; contributor PR **targets integration only**, not `main`. Existing public API remains compatible.
- **Collision audit:** Existing Issues #137–#145/#153 stay OPEN (unresolved); #142's Nursery implementation is already in current main, but is **not** hereby marked QA-complete. There were zero open PRs at initial G0 audit. Work must branch fresh from this integration SHA; diff only additive required Nursery controls, do not rewrite old UI tasks or borrow old engineer branches. Recheck collision before Engineer START and final merge.
- Appoint **one independent QA-SURVIVAL** when first Engineer PR is ready; QA must not certify its own implementation, and this Issue and PR must show its real report. Old QA-PROG is retired, not silently recalled.

## 6. Gate tests and user experience

- Three seeded normal-player routes with real Nursery build from physically delivered food and truly paid repeated eggs; verify first replacement adult and 30,000 ticks living queen **if feasible**; if regression, show exact blockers/ticks instead of synthetic promotion or artificial seed manipulation.
- Disable and resume at every QUEUED/laid/INCUBATING state; insufficient carbs/protein; original depot sources split across rooms; disconnected/full Nursery; dead queen; 150 population cap; slow/no nurse; brood timeout; order cancellation/refund after repeat; duplicate toggles, 2+ nurseries; research and weather regen mass; deterministic replay and x0/x1/x2/x4; Seed reset. On loss, never churn repeating orders.
- `npm test`, `npm run build`, and independent QA at exact integration SHA. Actual Chromium AND WebKit for `320×568`, `390×844`, `568×320`, `844×390`, `768×1024`, `1440×900`; default renovated and `?ui=legacy` (including no regression in menus/Focus/Map). Never claim device iOS/Android hardware tests without devices. Custom DOM/CSS controls with keyboard/screen-reader labels, 44px targets, no overlap.
- CEO verifies all release-critical checks at *the exact integration HEAD*, then Merge only that reviewed commit to `main`, rerun native/build and real browser main QA, close only this mission's Issues and discharge temporary team. Apply governance cleanup §5 only where verifiably supported.

## 7. Rollback

Single mission integration PR can be reverted in `main` without data migration, since no Save/Load and no change to resource world format. Turning Repeat off makes existing manually paid Queue flow identical to baseline. No mutations to the original source allocation, weather, caste implementation or existing Research catalog. Keep old `main` comparison SHA documented for diff verification.

**No code implementation is authorized merely by seeing this document; CEO must post `G1_FROZEN` with exact integration HEAD SHA and an explicit new Engineer Issue START.**
