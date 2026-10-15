# UI RENOVATION V1 — SHARED TECHNICAL CONTRACT
**Status:** G1 IMPLEMENTED — final API G1.0 documented; SHA/CI freeze confirmation is published in Issue #138 after exact-head checks. SIX feature UIs still not implemented.
**Source:** [MASTER PLAN](UI_RENOVATION_V1_MASTER_PLAN.md) · [QA](UI_RENOVATION_V1_QA.md)
**Target:** branch `feat/ui-renovation-v1-integration`; all code branches PR into it. **[Concrete G1.0 module/View/Actions API](UI_RENOVATION_V1_FINAL_API.md)** supersedes the old proposed signatures below. Exact source SHA and START authorization appear only in Issue #138 and each Engineer Issue after CI.

## 1. Structure and module boundaries

Coordinator implemented `src/ui/renovation/shell.js` and `shell.css`, the `ui-adapter.js` bridge, and owns `index.html` plus old `src/ui/app.js` / `combat-controls.js` / legacy CSS migrations. Developers create independently scoped `home`, `military`, `ants`, `nursery`, `rooms`, `settings` modules (one .js/.css per module) and focused tests. No other team edits those files.

Modules must **not** read game internals by inventing fields. Any needed field/command is exposed by the coordinator's read-only view models and real action adapters after examination of existing UI/game APIs. **Implemented** entry point (see exact mount/integration semantics in G1 FINAL API):
```js
mount(container, { view, actions, overlay, subscribe })  // returns cleanup()
update(view)  // optional, stable scrolling/focus
```
- `view`: snapshot created from real `game`, `ui`, `lifecycle`, `rooms`, `combat` (no mutation).
- `actions`: validated commands for existing gameplay; never direct fake counters, DOM scraping, state changes through CSS or duplicated simulation timers.
- `overlay`: only owner of open/close/stack, focus restore and mode transitions.
- `subscribe`: lifecycle for event-driven updates, debounced if necessary, no re-mount each tick.
- `cleanup()` must remove listeners and stale observers, especially after new Seed/world resets.

### Nonnegotiable compatibility

The existing source `#room-type`, `#nursery-profession`, `#nursery-level`, `#u6-dialog`, `#game-canvas`, `#selection-card`, game layers, commands and `Game` APIs remain operational until coordinator explicitly migrates each with regression evidence. Never ship a visible native OS selector, `alert/confirm/prompt/showPicker`. Existing `room-picker.js` and `game-choice.js` provide a working reference; reuse/unify after regression validation, don't create a third overlapping dropdown system.

## 1.1 ENGINEER A/B/C source-audit decisions — Coordinator G1 inputs

The following are verified source facts and decisions. Actual adapter signatures are defined in [G1 FINAL API](UI_RENOVATION_V1_FINAL_API.md); no Engineer START until Issue #138 posts G1_FROZEN SHA:

- **Layer toggle (A):** UI.switchLayer(layer) handles map-layer transition and dig/build exit on surface. Legacy [data-layer] listener supports two buttons; Coordinator replaces it with ONE shared PRIMARY_COMMAND toggle without double dispatch or duplicate state.
- **Seed reset (A):** existing Seed form calls UI.onNewWorld directly. Coordinator owns second-stage confirmation and world rebind for targeting, selection, map tool, camera, subscriptions, and overlays. Cancel never changes world, Confirm only once. Verify Unicode/IME/length handling without changing deterministic seeds.
- **Military HP (B):** soldier details currently hardcode /16; game.combat.maxHP(ant) scales by 16 + 3 × (level−1). Real squad snapshot must expose HP/current max, level, squad, status, formation and arrived count. Coordinator registers body-mounted military dialog with centralized overlay; continuous tracking is a proposed additional camera feature, not existing guarantee.
- **Resizable rooms (C):** roomPlan(type,width,height) supports positive integer widths/heights up to 8×8 with area ≥4, using scaled costs/ticks/capacities. Default is 2×2. Nursery capacity is min(width×height,16) and used/free is provided by lifecycle.nurseryStatus(roomId). **No assumption all Nurseries have only four slots.**
- **Egg lifecycle (C):** lifecycle.queueEgg validates ready, connected, reachable room, live queen, population cap, stock, and capacity. lifecycle.cancelEgg only succeeds for QUEUED orders and may return false; never show false refund success. LAID/HATCHED need not persist as queue rows; waiting-for-pickup/route is not incubation progress.
- **Dig/build (C):** Coordinator owns touch/drag/preview and state transitions. Display actual roomPlan price and validation, keep preview vs committed action distinct, and do not silently introduce a new second-confirm gameplay mechanic.
- **Issue-first workflow:** #138 stores G1 API decisions, #139/#140/#141/#142/#143/#144 store Engineers' design reports, questions and START orders, PR #146 stores integration changes. OWNER relays only MN #issue links; no M00000 or auto-communication assumptions.

**G1 source and tests are implemented.** Actual freeze requires successful exact-SHA native/build/Chromium/WebKit results and a `G1_FROZEN` comment in #138. See [G1 FINAL API](UI_RENOVATION_V1_FINAL_API.md); baseline UI remains visible until Coordinator G3 integration.

## 2. Layout geometry contract (single system)

**Only shell CSS** may place structural areas (header, nav, dock, inspector, sheet, toast, system modal, overlay mask). Feature CSS styles **inside the allocated slot** and must not use viewport-wide `position:fixed`, ad hoc `z-index:9999`, arbitrary global `body:has()` collisions, or reposition unrelated sibling panels.

Named regions: `HUD_TOP`, `PRIMARY_COMMAND`, `MAP_VIEWPORT`, `MAP_ACTION`, `CONTEXT_INSPECTOR`, `PRIMARY_SHEET`, `MODAL`, `TOAST`, `DEV_ONLY`. The **layer switch belongs inside `PRIMARY_COMMAND`**, not in a separate `LAYER_NAV` row. Shell reserves safe-area and actual layout height; hit testing uses true DOM geometry.

**Layout profiles:**
- narrow mobile 320–359 CSS px, 360–430, 431–680
- short landscape when usable height ≤500 CSS px independent of width
- tablet 681–1199; desktop ≥1200; support widths >1920 by max-content constraints
- Mobile/panel layouts must support visual viewport shrink caused by virtual keyboard, bottom safe area and reduced motion
- Use viewport-based profiles as defaults, verify actual geometry rather than trusting breakpoints alone

**Layer-toggle design lock (OWNER feedback):** Exactly ONE visible world-layer switch button in the shared command row/rail. No permanent two-button 'พื้นผิว / ใต้ดิน' selector, no separate bottom navigation tier, and no OS native selector. Tap toggles current `surface` ↔ `underground` through the **existing** `UI.switchLayer(...)` command, not a new independent world-layer state. Button shows the CURRENT layer via distinct icon and compact caption wherever it fits, plus an `aria-label` explicitly describing current layer and the destination, `aria-pressed` or equivalent consistent state indication, tooltip/title on hover, keyboard Enter/Space. On 320px a 5-control action row (inspect/dig/build/layer/menu) fits by 44×44 minimum hit targets with gaps and safe-area insets; use icon+compact text when space permits and **never hide which layer is active**. After switching to surface, existing dig/build disable/exit semantics still apply; all state indicators and help text update from authoritative `UI.game.layer` without duplicating business logic. Ensure any returning modal/inspector does not leave stale layer label. QA must test both toggle directions, repeat 20×, drag/map state, keyboard, landscape and no overlapping target/cancel actions.

**Stacking contract:** world 0, HUD 10, context inspector 20, popover 30, sheet 40, toast 50, modal backdrop 59, modal 60. Real `<dialog>` top layer needs explicit focus, lock, and underlay safety and overrides ordinary z-index.

**Pointer and scroll contract:** floating transparent wrappers pointer-events:none; actual controls pointer-events:auto; canvas pointer drag/pinch preserved. Pan-y only within scrollable sheet. No body scrolling while game active. Sheet list scrolls, its close/cancel/primary action stays reachable. Native editable input is permitted to select/copy/paste; surrounding game chrome is not.

**Panel contract:**
- `modal` excludes every other panel and prevents map actions; opening must dismiss lower popovers and return focus properly.
- `sheet` excludes other sheets; mobile opens as safe-area-aware bottom sheet or constrained full-screen with visible close; tablet/desktop may be side sheet.
- `inspector` may coexist with map and HUD only when there is physical space; on narrow screens it collapses when a sheet opens. It is restored when appropriate without losing selection.
- `popover` attached to owning sheet only, no z-index escape/clipping, close with Escape then outside click then explicit dismiss.
- `targeting` state ends a blocking sheet, exposes Cancel and context in a reserved target bar, preserves correct Squad/tool mode, and never treats the close/Cancel tap as map action.
- Toast, milestone, debug and Seed have explicit slots/state, not independent arbitrary positioning.

## 3. Interaction and data source of truth

| Domain | Authoritative existing behavior | UI must not do |
|---|---|---|
| Map/tile | `UI.bindCanvas`, `UI.toggleMapSelection`, camera `screenToCell`, tool modes | redraw world with HTML or intercept pointerdown on transparent overlays |
| Dig | `UI.setTool('dig')`, dig apply/remove/cancel and colony orders | allocate inaccessible work as if completed |
| Rooms | real room catalog/placement/queue/cancel/inventory | imply a success when placement is rejected |
| Ant | `antById`, `antsAtTile`, `renderAntInspector`, colony workers | change permanent profession or level from roster |
| Military | `CombatControls`, combat `getSquads`, rally/defend/retreat/transfer real commands | use obsolete conscription percentage |
| Nursery | lifecycle `nurseryStatus/eggCost/queueEgg/cancelEgg`; `UI.refreshNursery` | instant hatch; cancellation after QUEUED; invented ETA |
| Seed | existing `UI.onNewWorld` and seed dialog form | silently reset/claim save; replace live Game without cleaning listeners |
| HUD | `UI.updateWorld`, `UI.updateMetrics`, milestone snapshots | invent resources/HP/progress |

*This matrix records observed code symbols, not a blanket promise that every method is public. Coordinator documents exact validated facade signatures before implementation.*

## 4. Required UI patterns and quality rules

- Design tokens: named backgrounds, text, borders, positive/danger/warning, spacing scale (4/8/12/16/24), typography roles (Thai glyph and numerals), radius (6/10/14), elevations/overlay slots. Contrast: normal text target ≥4.5:1; icons/large text target ≥3:1; never rely on color alone. Respect keyboard focus and reduced-motion.
- Touch target minimum 44×44 CSS px, minimum 8px practical clearance unless visually connected segmented buttons; keep labels legible at 320px and 200% text zoom. No horizontal page overflow; scrollable data region may scroll but must signal overflow.
- Empty/loading/disabled/error/success states in every module; all actions show reason if blocked. No fake clickable buttons.
- Dangerous actions (new Seed/world reset, cancellation with lost progress) require explicit clarity about effect and confirmation when appropriate. Preserve entered seed if cancelled; show focus and typing/paste behavior.
- Performance: avoid rebuilding all ant rows every tick, causing focus/scroll jumps; throttle visual updates (but never delay authoritative game mutation); release event handlers on teardown; measure canvas FPS/regressions.
- Render with real DOM/CSS; Canvas remains map only. Responsive quality must be checked against iOS-like WebKit *and* Chromium plus actual iOS/Android hardware when available. Do not claim platform certification without hardware tests.

## 5. G1 foundation deliverables required before Engineer implementation

1. A screenshot-backed final wireframe in the integration PR for at least mobile 320×568, mobile 390×844, landscape 844×390, tablet 768×1024 and desktop 1440×900.
2. A working shell with panel registry and every named slot that preserves the existing game while feature UI is not yet migrated.
3. A deterministic overlay transition test matrix and CSS collision/hit test harness; explicit handling for `<dialog>` + body-appended military dock.
4. Versioned, concrete module API/view-model contract in [UI_RENOVATION_V1_FINAL_API.md](UI_RENOVATION_V1_FINAL_API.md), with all published method signatures and snapshot fields.
5. Freeze announcement: contract SHA, branch names, issue links, files exclusive to each Engineer, baseline test outcomes. No Engineer PR should be merged until this is supplied.

## 6. Review / merge / cleanup

Each Engineer submits focused test and actual screenshot proof. Integration coordinator alone handles shared files, migration and cross-panel fixes. QA reviewer tests baseline preservation plus full scenario matrix independently. **Any overlap, unreachable action, wrong simulator state, regression, browser mismatch or missing evidence blocks main merge.** Keep integration PR draft until all six modules and signoff are complete. After main merge and main CI, close issues and clean branches carefully.
