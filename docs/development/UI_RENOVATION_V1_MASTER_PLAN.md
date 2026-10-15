# ANT KINGDOM — UI/UX RENOVATION V1 | MASTER PLAN

**Status:** DESIGN/WORKBREAKDOWN AUTHORIZED · GAMEPLAY IMPLEMENTATION HOLD · MAIN MERGE HOLD
**Baseline main SHA:** `b473cd678c5b8a3ac0bb87c4056c1afab15fd9f2` (16 Oct 2026 planning reference)
**Integration branch:** `feat/ui-renovation-v1-integration`
**Authoritative UI rules:** [UI_CROSS_PLATFORM.md](UI_CROSS_PLATFORM.md) · [UI_RENOVATION_V1_CONTRACT.md](UI_RENOVATION_V1_CONTRACT.md)
**QA acceptance:** [UI_RENOVATION_V1_QA.md](UI_RENOVATION_V1_QA.md)

## 0. Scope and non-goals

Completely renovate presentation and player interaction **for six areas**: (1) main gameplay HUD/map, (2) military command center, (3) ant population and inspector, (4) Nursery/egg management, (5) room construction/excavation flow, and (6) settings + seed/world generation. Include adjacent milestone panel, debug, toasts, layer/time/zoom/navigation and overlays as cross-cutting interaction participants. Objective: a cohesive *game* on 320px phones to 1920px desktops, zero unintended overlap/hit interception, clear information priority, consistent cross-platform native-*free* selectors, complete accessibility and no simulation behavior changes.

**Do not rewrite or relax** lifecycle costs/caps, fixed professions Lv1–5, starter workers, 2×2 Nursery/4 slots, physical egg pickup, A/B squad behavior, dig/room resources, seed determinism, camera behavior, or existing public UI IDs/event semantics without an explicit migration test. No save/load work; no new game mechanics. Scope includes seed confirmation safety and the currently present experimental/debug UI.

## 1. Evidence-based audit of current code

Read actual main repo:
- `index.html` contains header/stock/time/population/seed, mission report, population, region, dig tools, room palette, speed & zoom, debug, Nursery, tile/ant selection, layer footer, seed dialog. `src/ui/combat-controls.js` additionally creates **military dock and dialog from JavaScript** and appends them to `document.body`, loading a separate `combat.css` dynamically.
- Global UI behavior is concentrated in `src/ui/app.js`: click/pointer listeners, canvas pan/pinch/tap, tool switching, room picker, ant inspector, Nursery queues and seed submit. `src/ui/ant-inspector.js` renders ant rows. Room picker and ant profession/level pickers are now CSS/DOM, not the OS native choice sheet.
- **Multiple overlapping style generations** are loaded in sequence: `styles.css`, `v1.css`, `v2.css`, `v2-fixes.css`, `v3-compact.css`, `inspector.css`, `nursery.css`, `game-choice.css`, plus **dynamically added** `combat.css`. Responsive rules, `:has()`, fixed coordinates and disparate `z-index` are repeated across these files.
- UI panels have incompatible placement logic: `colony-panel`, `selection-card`, `nursery-panel`, `milestones-panel`, `debug-panel`, `u6-dialog`, `u6-dock`, `room-palette`. Nursery contains CSS that hides selection only through `visibility:hidden`, and the 320px CSS reserves a hard-coded right military lane. Changing any one of these can cause another overlap.
- The legacy workforce percentage sliders remain in HTML but are hidden (permanent castes); the military dialog includes legacy percentage UI hidden by CSS. The renovation should eliminate *visible confusion* and eventually retire obsolete legacy presentation only after compatibility tests and functional approval.
- In 320×568 Chromium QA screenshot the HUD uses top stock/time/speed, mission action, lower dig/room/tools, layer switch and a tactical right lane simultaneously; this leaves little unobstructed map and many competing tap targets. On the 390×844 room screenshot, room placement hints and toast occupy lower regions near construction tools. On 320px military screenshot the dialog uses almost full vertical height. These are **layout pressure/risk observations**, not a claim that all overlap tests currently fail.
- A prior desktop R2 regression intermittently failed same-cell tile-card toggle during live ticks; browser harness was made deterministic with scoped simulation pause. Keep that regression as a required test; do not simply drop it.

**Evidence:** [R2 5-viewports passing run](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38774771847), [Cross-browser selectors passing run](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38774770599). Browser screenshot evidence is CI-based Chromium; device hardware Safari/Android cannot be asserted tested.

## 2. Experience architecture: MAP-FIRST, ONE PANEL OWNER

### Visual hierarchy
1. **World canvas** remains dominant and supports continuous drag/pinch, tile tap, dig drag, room placement and rally selection.
2. **At-a-glance HUD** shows only critical resources, day/time/speed, population and context alert; less used items fold into sheets on small screens. Information remains reachable, never silently inaccessible.
3. **Persistent core actions:** inspect, dig, build, ant management, military, layer switch; exact placement changes by viewport but labels/icons/functions stay consistent. Nursery appears as contextual action when selecting a ready Nursery room, not a permanently floating unrelated button.
4. **Context detail** appears in ONE designated inspector slot for selected tile/ant/room. Heavy editors use ONE sheet/dialog and do not compete with each other.
5. **Notifications** use a reserved toast lane; never cover submit/cancel, real-time military target banner or bottom navigation.

### Device-specific map and control arrangement
| Mode | Expected strategy |
|---|---|
| Phone narrow 320–359 portrait | Compact 1-line HUD + expandable resource details; ONE primary tool row with inspect, dig, build, **single layer-toggle button**, and menu (each usable ≥44×44 px). **No second bottom row for surface/underground**. Tactical controls collapse inside discoverable menu/status. One active scrollable bottom sheet above safe area. Map touch remains available when no blocking sheet. |
| Phone 360–430 portrait | Similar, 2-line HUD only if measurement permits; choose concise names and tooltip/help. Medium sheet (snap compact/expanded) with capped height and visible dismiss. |
| Large phone/foldable 431–680 | Floating/collapsible inspector and bottom command rail using measured width; do not infer handset simply from width. |
| Short landscape (any width, especially 568×320 / 667×375 / 844×390) | Low-height top status, left compact tool rail, right compact status; heavy panel uses scrollable inset side sheet or maximally available sheet. No horizontal toolbar spreading across canvas center. Virtual keyboard must not trap primary actions. |
| Tablet 681–1199 | Top HUD, left actions, right contextual inspector (reserved safe zone), expandable heavy sheet with constrained width; tap canvas outside closes only dismissible overlays. |
| Desktop ≥1200 | Top HUD, left command rail with ONE layer-toggle action (not two persistent scene tabs), right contextual inspector; speed remains in compact HUD. Heavy management uses centered game-styled modal or side dock with keyboard/ESC/focus management; no unused giant overlays. |

**Implement responsive layout via CSS Grid/Flex/container-aware rules, `minmax(0,1fr)`, `clamp()`, safe-area env, `dvh` fallbacks and actual measured collisions, NOT just dozens of arbitrary `left/top/bottom` pixel exceptions.** Avoid hover-only navigation, noninteractive text and hard-coded reserved lane width. The landscape rule depends on **available height**, not width alone.

### Global interaction-state contract
- One owner of panel state, `UIOverlayController` (Coordinator implements) with suggested commands `openPanel(id,context,opener)`, `closePanel(id,reason)`, `closeTop()`, `isOpen(id)`, `setWorldMode(mode)`, and `onVisibilityChange()`. These are **proposed contracts**, not existing APIs. Map interactions remain `UI`/`CombatControls` authority.
- Panel types: `nonblocking-inspector`, `context-popover`, `blocking-sheet`, `confirmation-dialog`. Only one blocking sheet/dialog at a time. Popovers cannot outlive their owning sheet. `Escape` closes the deepest submenu first, then sheet, never triggers gameplay when a text field is focused. Outside tap never accidentally issues a dig/rally action.
- All panels must return focus to the invoking control where applicable and update `aria-expanded`/hidden state together. Never rely on CSS-only `visibility:hidden` as authoritative application state. Native `<dialog>` for modality is allowed if **its visible content is completely game-styled**; native `alert/confirm/prompt` or visible OS `select` popups are not.
- Predefine stacking tokens instead of arbitrary values: map 0, HUD 10, inspector 20, popover 30, sheet 40, notification 50, dialog 60, overlay mask 59. Avoid applying z-index to top-level independently; dialog top layer behavior must be explicitly accounted for. Panels appended to `document.body` must share the overlay controller and same tokens.
- Never close/open panels repeatedly from the regular game update tick. Use state transitions and only update their **content**, keeping scroll position, focus, and choice selection stable.
- A targeted action (rally, dig selection, room placement) owns a compact **action banner with Cancel**, and all blocking panels close before the map starts receiving action taps. Preserve current user choice on cancel where reasonable.

## 3. Renovation work packages (six features)

### UI-01 — Main game screen / HUD
**Responsible:** Engineer 1, first stream.
- Consolidate title, resources, population, clock/speed, milestone access, debug entry, **single layer toggle**, map tools & tactical trigger in a clear visual hierarchy. The map layer is a two-state action, so do **not** render separate permanent 'พื้นผิว'/'ใต้ดิน' tabs or reserve an additional bottom row: on portrait phones it joins the primary action row; on landscape/tablet/desktop it joins the compact tool rail. The button shows its **current layer** (icon and/or concise text), has an accessible label naming current and destination, and switches to the other layer in ONE tap. A single visual vocabulary (spacing, typography/Thai overflow, icon treatment, button states, loading state).
- Map must be visually primary; visible resources are never replaced by decorative chrome. Add compact/expanded HUD states as responsive adaptations with discoverable secondary data.
- Distinguish pause/speed x1/x2/x4, selected surface/underground, disabled actions aboveground, dig/inspect/build mode. Make active/disabled/focus states unmistakable.
- Improve toast lane, progress hints, camera recenter and zoom availability on touch/keyboard. Milestone/debug overlays follow shell panel policy; high contrast and large hit targets.
- **Acceptance:** no clipping at narrow/large/landscape; one tap to switch map layer, both current-layer states visually discernible at 320px; five primary actions remain ≥44×44px and fit without horizontal scrolling; **no second layer tab row**; all existing controls available through at most two deliberate actions; no inadvertent map interception, page-level scrolling or zoom breaks; game speed/tile interactions preserved.

### UI-02 — Military management
**Responsible:** Engineer 2, first stream.
- Redesign Squad A/B overview (soldier count, HP, orders, arrival, guard/threat) with primary action hierarchy. Readable rosters with soldier, status, HP, destination, actionable detail and transfer where allowed.
- On narrow phone, don't persist three full-width tactical buttons beside main toolbar; use a clear single military trigger/compact quick-actions, and one scrollable command sheet.
- Clear `select squad → issue order → pick map target → success/cancel` flow. Rally banner cannot overlap map tools and does not mistake tapping cancel for a rally tile.
- Wounded, dead, no soldiers, retreat, unreachable, threat and empty Squad B must render correct states with meaningful copy. Never expose old recruit/demobilize % mechanics.
- **Acceptance:** A/B orders function, focus/look-at ant works, modal/roster stays scrollable at 320×568 and short landscape, no overlapping inspector or toolbar.

### UI-03 — Ant population and individual management
**Responsible:** Engineer 2, second stream, separate PR and folder.
- Build one accessible ant population roster with Starter + five permanent castes and Lv.1–5 grouping, counts, stable row ordering, search/filter (UI only where feasible) and summary without a 2D table overflowing mobile.
- Inspect an individual ant from world tile and from troop roster. Show ID, profession, level, HP (where applicable), task, location/layer, status, inventory/carrying info only if real game data exists; never invent values.
- Distinguish selecting a tile, selecting an ant, and following an ant; preserve selection and navigation when the sheet closes or the unit moves. Handle 0/1/many ants in tile, queen, dead/despawned unit, dynamic lists without losing focus.
- **Acceptance:** exact existing `antById` and `renderAntInspector` data semantics, touch/keyboard access and no unintended role reassignment.

### UI-04 — Nursery and egg orders
**Responsible:** Engineer 3, first stream.
- Redesigned context sheet for Nursery with 4-slot capacity, occupancy, room connected/blocked state, queen status, population cap 150, profession/level selectors (reuse game CSS picker), real cost/stock availability and queue states.
- Readable timeline: queued → laid → awaiting pickup → carrying / waiting route → incubating → hatched. ETA must distinguish waiting from true incubation; never invent countdown. Show per-order cancel **only while cancellation is legal**, with clear refund semantics and disabled explanation.
- If room not built, unconnected, queen dead, no resources, max population, occupied capacity, invalid data, show explicit reason and safe action. Changing selection while sheet open cannot silently queue into stale room.
- **Acceptance:** real queue/cancel/progress integration, scroll/focus preservation while game ticks, no sheet overlap with map inspector or military, all forms 320×568 and 844×390.

### UI-05 — Room construction / excavation tools
**Responsible:** Engineer 3, second stream, separate PR.
- Rework inspect/dig/build as a consistent tool mode switch. In Build: game CSS room-choice menu, footprint preview 2×2, accessibility of build cost, target tile and connected-path requirements; show errors before committing when source game APIs permit.
- Clearly differentiate room planned/building/ready/disabled, resource reservation, cancel/refund and construction progress; avoid showing impossible 'success'.
- In Dig: keep drag selection, apply vs cancel, overlap draw-to-cancel and inaccessible corridor/route handling, preserve camera pan and accidental drag safety. Tool banner must not hide map tiles or squad actions.
- **Acceptance:** no input regression in room builds or dig drag (both touch and mouse); overlays and room palette cannot escape viewport or cover Cancel/Apply.

### UI-06 — Settings and world Seed
**Responsible:** Engineer 1, second stream, separate PR.
- Introduce single visible Settings entry with game-themed sheet for world settings/Seed; use existing deterministic generation only. Display current Seed, editable Seed, validation and clear description that **new Seed recreates/resets current world**, never imply an automatic save exists.
- Two-stage confirmation for destructive reset with custom styled dialog and explicit Cancel/Proceed, keyboard/IME-safe input, copy/paste allowed only in edit fields, no iOS callout for non-editable game chrome.
- Include low-motion/accessibility preferences only if truly wired; avoid fake toggles or adding unrequested persistence. Keep Debug separate as dev setting and clearly marked.
- **Acceptance:** typing Thai/English/long Seed, Enter/ESC, keyboard open/resize, unsaved world warning, deterministic new-world reset semantics, no OS prompt/alert.

## 4. Staffing and ownership — 3 developers + coordinator + independent QA

Use only **3 independent Engineer chats** if staffing is useful; OWNER relays orders; no synthetic inter-agent messages:
| Role | Sequence | Exclusive new paths |
|---|---|---|
| **COORDINATOR (this chat)** | Design contract → shell → adapter integration → final merge | `src/ui/renovation/shell.js`, `shell.css`, `ui-adapter.js`, `index.html`, `src/ui/app.js`, `src/ui/combat-controls.js`, legacy CSS edits, workflow configuration, integration checks |
| **ENGINEER-1** | UI-01 then UI-06 | `src/ui/renovation/home.js`, `home.css`, `settings.js`, `settings.css`, focused tests `tests/ui-home-*.test.mjs`, `tests/ui-settings-*.test.mjs` |
| **ENGINEER-2** | UI-02 then UI-03 | `src/ui/renovation/military.js`, `military.css`, `ants.js`, `ants.css`, focused tests `tests/ui-military-*.test.mjs`, `tests/ui-ants-*.test.mjs` |
| **ENGINEER-3** | UI-04 then UI-05 | `src/ui/renovation/nursery.js`, `nursery.css`, `rooms.js`, `rooms.css`, focused tests `tests/ui-nursery-reno-*.test.mjs`, `tests/ui-rooms-reno-*.test.mjs` |
| **INDEPENDENT QA reviewer** | Architecture review, premerge browser screenshot/interaction audit | QA evidence/review only; may propose fixes via comments, should not attest own code as independently reviewed |

**Hard ownership rule:** Engineers may not edit `index.html`, old UI CSS, `src/ui/app.js`, `src/ui/combat-controls.js`, shared `shell.*` or core simulation files concurrently. Submit an API/adapter request on the integration issue for coordinator to implement. If an exclusive file needs another engineer's change, coordinate before commit. The coordinator alone connects new modules and retires old DOM/CSS after QA.

Each work package has its **own issue and branch/PR targeted at integration**, not game main. Tasks from one engineer may be done sequentially or independent branches, but all use the frozen integration contract SHA as base. New modules must export mount/unmount or update lifecycle hooks as agreed before implementation; the exact function names are negotiated at the shell gate, not assumed to exist.

## 5. Execution phases and gates

- **G0 Current audit (done for planning):** identify DOM/CSS/JS map, screenshots, mechanisms and user tasks; record baseline before changing UI.
- **G1 Foundation/design freeze:** coordinator builds tokens, shell/overlay control, mounting API, focus/scroll/safe-area behavior and test harness, validates desktop+mobile shell with zero gameplay redesign. Engineers cannot start implementation until frozen contract/head SHA is relayed.
- **G2 Six independent feature tracks:** Engineers implement their own two modules. Every track provides PR link, exact SHA, before/after screenshots, focused CI + interaction demonstration; reviewers can request rework.
- **G3 Controlled integration:** coordinator mounts modules, removes obsolete visible markup **one piece at a time**, ensures old IDs, engine API and event semantics remain, tests overlay pairwise scenarios after each PR. No blind CSS z-index fixes or hiding unrelated buttons. Conflict/missing contract → return to owner, not monkeypatch in another module.
- **G4 Acceptance:** native `npm test`, build, all existing browser suites, new Chromium/WebKit viewport × state matrix, touch, tap target/hit coverage, focus/keyboard, screenshots, interactive paths, real data, negative cases, independent QA sign-off.
- **G5 Release:** only when all P0/P1 issues fixed and baseline behavior preserved, mark integration PR ready and merge into `main`; verify **main CI separately**. Deployment on hosting needs separate confirmation; don't claim device test or production deploy without evidence. Close all issues, retire temporary branches with care. Keep only `main` after task closure where available and no active branch is still needed.

**Quality bar:** no cosmetic-only acceptance. The six modules must work as one UI system with consistent spacing/interaction states. If QA fails, hold integration/main. Do not lower assertions, remove browser scenarios or mask panels to fabricate a pass.

## 6. Owner and relay protocol

This is the **single task overview**. Coordinator gives the OWNER concise copyable orders for Engineer 1/2/3 after the shell contract is implemented/frozen. Each Engineer must return: role, issue/PR, head SHA, edited paths, functionality, tests run, full failing list, known risks, screenshots/evidence. Owner only relays; technical sign-off rests with coordinator plus an independent QA reviewer for this large visual refactor.

**Current authorization is planning and work-breakdown only.** No one may report the 6 redesigned UIs as implemented yet; the integration branch currently contains a design plan, not completed renovation.
