# ANT KINGDOM — UI RENOVATION V1 QA & RELEASE GATES

**Status:** PRE-IMPLEMENTATION TEST SPECIFICATION
**References:** [MASTER PLAN](UI_RENOVATION_V1_MASTER_PLAN.md) · [CONTRACT](UI_RENOVATION_V1_CONTRACT.md)
**Rule:** No feature is accepted on static source checks alone. Every PR must pass focused logic and real DOM/touch validation. Coordinator must test combined state; the independent reviewer must examine original vs renovated screenshots.

## 1. Required viewports / orientations (CSS pixels)

| Identifier | Width × height | Reason |
|---|---|---|
| S0 | 320×568 | tightest supported portrait |
| S1 | 360×640 | common narrow Android |
| S2 | 375×667 | smaller iOS-class portrait |
| S3 | 390×844 | current main mobile QA |
| S4 | 430×932 | wide mobile |
| L0 | 568×320 | **shortest landscape** |
| L1 | 667×375 | short landscape |
| L2 | 844×390 | current landscape QA |
| T0 | 768×1024 | portrait tablet |
| T1 | 820×1180 | larger portrait tablet |
| T2 | 1024×768 | landscape tablet |
| D0 | 1280×720 | low-height desktop |
| D1 | 1440×900 | existing desktop |
| D2 | 1920×1080 | wide desktop |
| Z1 | responsive at 200% browser zoom / larger text | visual overflow, focus/cutoff check |
| K0 | virtual keyboard open on supported mobile flow | view-height shrink, caret and action visibility |

**Engines:** Chromium phone/desktop + WebKit phone/desktop for G4. Firefox is a desirable additional desktop engine, not a substitute for real hardware. iOS hardware Safari and Android Chrome should be manually checked when available; absent hardware means `HARDWARE_QA_NOT_VERIFIED`, not `PASS`.

## 2. Geometric and hit-test acceptance

Measure visible `getBoundingClientRect()` for map HUD, left tool strip, right tactical actions, selection info, heavy sheet/dialog, notification lane, room picker, Nursery options and close/actions. For every required viewport/state:

- No panel's **interactive bounding box** intersects another unrelated interactive panel's box unless allowed by the documented modal/sheet overlay relationship. An intentional modal mask can cover background; an overlay cannot invisibly intercept its underlying controls in a nonblocking state.
- Visible controls have valid bounds inside visual viewport and relevant safe-area; no negative/offscreen or clipped buttons (including header close, primary action, Cancel); no document horizontal overflow greater than 1 CSS px.
- `document.elementFromPoint(center of each intended tappable control)` returns it or legitimate descendant; testers use **actual pointer/touch click**, not JS `element.click()` bypass. Confirm 44×44 CSS pixel targets and meaningful labels.
- No click-through: tapping toast, Cancel, modal backdrop, closing sheet or popup does **not** issue dig/room/rally/map selection.
- Content scrolls without moving header/close/primary controls out of reach; keyboard focus and screen readers remain usable.
- Screenshots compared to approved per-profile baseline and reviewed by a human for text collision, Thai wrapping, color contrast, icon semantics, crowded map and awkward negative space.
- No 100% theoretical proof for infinitely many sizes: automated matrix plus responsive constraints and critical intermediate measurements are required.

## 3. Scenario matrix — every feature + cross-interactions

Each scenario marked P0 is a hard release blocker. Run on all S0/S3/L0/L2/T0/D1 minimum (full set above for overall smoke); all engines for essential control paths.

### Global main HUD/map
- [P0] First boot at Seed ANT-001, no overlap topbar/resource/status/milestones/speed/zoom/layer/nav/tactical dock.
- [P0] Pan with mouse and touch, pinch, wheel, recenter, switch layer. No blocked canvas except intentional sheet.
- [P0] **One-button layer switch**: 320×568 toolbar shows exactly one (not two) layer button in the existing five-control action row, **no second layer-nav row**, all five ≥44×44 and fully hit-testable. From underground tap once → surface (label/icon/aria update); tap once → underground. Verify `UI.game.layer`, map rendering and disabled dig/build semantics after both transitions, then repeat 20× without focus/selection drift. Check keyboard Enter/Space, short landscape rail, tablet/desktop. No need to open an extra menu to switch layers.
- [P0] At 320px and safe-area inset, switching layer never compresses or obstructs the five main actions, occupies no new vertical strip, and does not trigger map dig/room/rally actions or reopen a previously dismissed sheet.
- [P0] Inspect → dig → build → inspect, reselect mode, change layer while tool active, disabled dig/build on surface.
- [P0] Speed pause/x1/x2/x4 visually accurate; clock and HUD update without pointer/scroll/focus jumps.
- [P0] Expand resource/status/menu while command bar is open, outside tap, ESC, toasts.
- [P1] Long Thai strings, small viewport and text scaling, large numbers 0 / max / 999999, empty resources and errors.
- [P1] Milestones/debug panel state, reduced motion, high contrast, tab order, screen reader labels.

### Military A/B
- [P0] 0 soldiers, 1 soldier, 2+; active Squad A/B switching, transfer real Soldier, no forced profession changes.
- [P0] Pick Squad B → rally mode → map tap → confirmation/cancel; camera drag during targeting; tap Cancel must not command rally.
- [P0] Defend, retreat/heal, unreachable path, queen emergency, death, enemy present and no enemy.
- [P0] Military dialog opened from inspect/build/Nursery/population; old panel closed/suspended, no stacking leak.
- [P0] Scroll long roster (up to colony cap), selection/detail/follow and return focus; dialog close restores opener.
- [P1] Buttons with unavailable action reason, no hidden legacy recruitment controls.

### Ant management
- [P0] Show Starter, all five permanent professions and Lv1–5; zero for several groups; no fake castes/levels.
- [P0] Tile with zero/one/multiple ants; choose ant; ant moves; follow ant across layers; dead/despawned ant.
- [P0] Open list from population and troop UI; close/return; search/filter preserves row focus and scroll.
- [P0] Long list on narrow screen, scroll and choose without activating map through the panel.
- [P1] Dragging camera while inspector dismissed, details text wrapping, HP/progress if appropriate.

### Nursery
- [P0] No ready Nursery, newly built/disabled/disconnected/ready Nursery, 4/4 slots full, population 150, insufficient resources, queen death.
- [P0] All 5 professions × Lv1–Lv5, correct cost and queue, valid room linkage, no auto hatch.
- [P0] QUEUED cancellation and refund, then LAID/PICKUP/CARRYING/WAITING_ROUTE/INCUBATING/HATCHED with cancellation permission correctly constrained.
- [P0] Scroll list while simulation advances, queue updates do not reset scroll/focus; close and reopen selected Nursery.
- [P0] Open menu (profession/level) + overlay collision with military/right dock/layer/action/virtual keyboard.
- [P1] Stable spinner/progress, reason text instead of unexplained disabled buttons, no false ETA for queued eggs.

### Construction and excavation
- [P0] Dig drag selects multiple tiles, add/cancel/reselect previously requested tiles; no mistaken camera drag.
- [P0] Build 2×2 valid and invalid sites, overlap, unreachable terrain, connected path, funded vs insufficient stock.
- [P0] Planned/building/ready/disabled room view, cancel refund and progress; no duplicate placement on tap.
- [P0] Room picker open in portrait/landscape while tactical dock and ant inspector accessible; close/ESC/outside tap.
- [P0] Change room selection, switch layer, switch inspect/dig, pause/speed while build mode active.
- [P1] Tap success feedback and toasts visible but not covering Apply/Cancel or layer controls.

### Settings / Seed
- [P0] Open from initial UI, while population/Nursery/military opened, and after world reset; modal exclusivity.
- [P0] Edit valid ASCII and Thai Seed, empty input, max length 40, input composition/IME, clipboard paste and selection.
- [P0] Cancel new world leaves **all game state unchanged**; confirm resets exactly through real `onNewWorld`, including any active drag/selection/targeting/queued jobs, and no stale modal listener.
- [P0] Keyboard Enter, Escape, browser back/close behavior; dialog text/confirmation always visible with soft keyboard.
- [P1] No automatic save claims; debug labeled experimental, no fake preference switches.

### Pairwise panel collision / transition (critical)
Test all ordered openings for the six management domains, plus `selection-card`, milestones, debug, room picker, popup options, toast and tactical target banner. Rather than exhaust every state permutation, use **all domain-pair transitions in both orders**, plus full high-risk triples:
- Nursery + tile inspector + military; nursery + room picker + settings.
- Military A/B targeting + dig tools + layer switch.
- Ant detail + population + military roster.
- Build room picker + region/toast + bottom action bar.
- Seed modal + keyboard + prior sheet; debug + selection + tactical dock.
- Open/close transitions repeated 20× without memory leak, stale overlay, loss of focus, duplicate IDs or stale Game references.

## 4. Required automation and evidence

- Native: `npm test` with exact pass total and `npm run build` **on the exact candidate SHA**.
- Existing browser suites: `browser-phase1-ui-audit.py` (five real viewports), `browser-nursery.py`, `browser-u4.py`, `browser-u5.py`/logistics, `browser-u6.py`, `browser-v2-ui-fix.py`, `browser-v2-live.py`, current long-press and game-choice tests. If a test requires redesign, migrate expected DOM while preserving the behavioral assertion.
- New: `tools/browser-ui-renovation.py` (or equivalent) orchestrates matrix by engine/view. Machine-readable reports with exact SHA, browser/viewport, state, panel rectangles, `elementFromPoint`, JS error count, interaction output and screenshot paths. Use deterministic simulation only inside scoped test fixtures; never mask functional bugs or weaken assertions just to pass.
- Independent QA reviewer evaluates interactive flows, screenshots before/after from CI and at least one exploratory narrow/landscape/desktop session. Review comments include `P0`/ `P1` with reproducible steps, viewport and screenshots.
- Document `HARDWARE_QA_NOT_VERIFIED` where hardware unavailable. Do not report host deployment without external verification.

## 5. Acceptance result format

```
TRACK: UI-01...UI-06 or INTEGRATION
PR: URL
TESTED_SHA: full SHA
ENVIRONMENTS: Chromium/WebKit, viewport list, hardware (if actually tested)
NATIVE: pass/total; BUILD: pass/fail
BROWSER: passed/total scenarios
VISUAL_COLLISIONS: 0 verified for tested states or documented reproducible blockers
REGRESSIONS: 0 P0/P1 open for release
SCREENS: URLs/artifact references
REVIEWER: independent QA identity/report (must not fabricate another AI's sign-off)
RESULT: PASS / REWORK_REQUIRED / BLOCKED
```

**P0**: broken game action, unintended reset, inaccessible close/confirm/cancel, hidden or overlapping control, tap-through, false state/resource, JS exception, keyboard trap, core game regression. **P1**: unreadable text/contrast/spacing, excessive scroll, nonresponsive variant, flickering focus. **P2**: polish only, documented for follow-up; may be waived with rationale. NO `main` merge while P0/P1 remains, required check failed or the screenshots/interaction evidence is missing.

Current work is **plan, not a passing renovation**.
