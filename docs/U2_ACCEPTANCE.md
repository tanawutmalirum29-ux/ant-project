# U2 — Digging & Navigation: Acceptance & Regression

Date: 2026-10-13 | Version: 0.2.0

## Scope and acceptance

| Work | Implemented | Verified |
|---|---|---|
| U2.1 Worker/queen spawn | 5 workers + 1 queen, live entity positions | Spawn always in walkable chamber for 5 independent world seeds |
| U2.2 Pathfinding | 4-neighbor A* and per-worker BFS reachable map | Deterministic routes never cross walls; no false path to dirt |
| U2.3 Dig tool | Desktop click/drag + mobile pointer/touch, green preview | Chromium interaction tests on desktop, portrait, landscape |
| U2.4 Work queue | Up to 600 outstanding unique orders; one assigned worker per job | Duplicate requests blocked; no duplicate reward/completion |
| U2.5 Digging AI | Workers find reachable frontier, walk, work; slower on hard soil | Excavation modifies terrain only upon completion |
| U2.6 Dynamic navigation | Previously inaccessible queued dig accessible after frontier opens | Two-stage excavation regression test |
| U2.7 Cancellation | Cancel queued / assigned jobs, release worker | Does not mine canceled terrain or resurrect job |
| U2.8 U1 regression | World generation, fixed clock, camera and layer switching | 5 U1 tests still pass |

## Tests performed

- `npm test` — 14 passing tests (9 U2 + 5 U1); repeated after final changes.
- `python tools/browser-smoke.py` — optional Playwright-based visual interaction smoke; passed at 1440×900, 390×844 and 844×390. Checks dig button, touch taps, click-dig, drag-dig, cancellation, switching surface/underground, new world seed reset and debug visibility, with 0 JS page exceptions.
- Headless Chromium environment restricts direct localhost/file URL navigation. Browser smoke injects an ordered bundle of the **same JS module source** and CSS into a document instead; Node tests load the original ES modules. Real hosted page module loading and mobile FPS should be additionally checked after deployment.

## How to test manually

1. Visit the repository's static page or run `npm start` and open http://localhost:4173.
2. Stay in Underground; visually confirm queen + five workers, population 6.
3. Select **⚒ สั่งขุด** and tap dirt adjacent to an existing tunnel. Confirm highlighted order, then follow an ant moving to it and digging through it.
4. Drag over a patch of soil to queue a larger area. Check progress bars and `คิวขุด` count; workers should open a traversable corridor, and new reachable work should be picked up.
5. Select an ordered cell; choose **ยกเลิกคำสั่งขุด**. Ensure canceled work stops and does not silently complete.
6. Pause while digging: time and dig progress must freeze. Resume at x2 and x4.
7. Switch to Surface then Underground: pending excavation continues; no population or task reset.
8. Create a new seed; colony and order queue reset to 6 ants, 0 jobs, initial clock.

## Known limits, next work

- Orders in isolated closed areas remain queued until a connected access corridor opens. This is intentional.
- Workers do not forage, haul soil as physical items, or enter the surface world yet (U3).
- Queen currently remains at the initial chamber; lifecycle begins U4.
- No save/load; creating a new world removes unsaved progress (U8).
- Performance on low-end real mobile devices remains unprofiled; browser screenshots are not performance proof.
