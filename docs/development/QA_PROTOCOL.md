# QA and Release Protocol — Ant Kingdom
Baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237 | Source audit ≠ runtime verification.

## Review gates and states
Planned → In Progress → PR Submitted → Under Review → Needs Rework OR Verified on PR → Owner Approved (core) → Merge → Verified on main. Never equate merged with deployed. A test run must record SHA, command, OS/Node/Chromium version, exit code, logs, case counts, seed, and timestamps. Test "exists" is evidence of coverage intent, not PASS.

## Required before any PR review
- git fetch origin main; record git rev-parse origin/main, git rev-parse HEAD and base SHA.
- git diff --name-only origin/main...HEAD (show rename/deletes too). Reject every path outside exact task allowlist.
- npm test (node --test tests/*.test.mjs, Node >=20); npm run build; verify dist/index.html, dist/src/main.js, dist/src/core, dist/src/ui and linked relative CSS/JS files.
- Run relevant test script with actual exit status; do not omit failing checks; keep snapshots/logs separately in artifacts.
- For UI: actually run Playwright Chromium tests on 320×568, 390×844, 768×1024, 844×390 and 1440×900, pointer/mouse/touch, room picking, selection, debug, popup, tactical dock, map pan/pinch/wheel zoom, page zoom guard, screenshots, no uncaught JS errors.
- For Gameplay: assert paused objects byte-identical; layer change does not replace state; movement stays cardinal walkable except portal; mining/building consume >0 ticks; one owner per task; cargo/reservations and stock conserved; death returns task; room disconnection blocks remote deposit/consume; soldier enlistment never creates ant.

## Regression matrix
Economy change -> foundation, digging, foraging, lifecycle, rooms, room-logistics, combat, browser-u5-logistics and browser-u6.
AI/combat change -> foundation, digging, foraging, lifecycle, rooms, combat, browser-u6 and browser-smoke.
UI change -> foundation and complete npm test, browser-v2-ui-fix, browser-u6 and browser-v2-live; visual screenshots 5 viewports.
Shared/integration change -> ALL npm tests, ALL browser scripts relevant to active runtime, full static build, verified PR CI checks.

## Stress / determinism
Use fixed seeds ANT-001, old-case, u5r-build, u6-priority plus 10 new recorded seed strings. Test 5, 50, 100, 150 workers; room counts 1/8/16/32; 0/100/600 mining orders; surface/underground switch; paused tick; serializable inventory snapshots. Capture median/p95 simulation ms, browser FPS and memory; avoid hard perf PASS without an agreed reference device and baseline. Compare duplicate run snapshots from same seed/ticks. Sim heavy tests must not depend on wall clock.

## Repro/bug template
ID / Task / branch & SHA / severity / component / exact seed / initial setup / numbered actions and tick count / expected / actual / assertion trace, console/log and screenshots / how often repeated / suspected cause vs confirmed cause / affected paths / owner / required decision / linked PR.
Use labels 'Suspected' for source-level hypothesis, 'Reproduced' only after actually running the steps. If a failure is outside task allowlist: REPORT ONLY; do not patch it.

## HEAD acceptance procedure
1. Confirm exact allowed diff and base SHA before reading tests.
2. Review interface compatibility, resource ledger, task ownership and data races/order.
3. Run new tests and complete regression locally if access is available; inspect CI logs and verdict separately.
4. Verify user-visible behavior in supported Chromium layouts for UI/gameplay.
5. Issue Needs Rework with reproduction or mark Verified on PR; no fake green status.
6. For core gameplay, request explicit owner authorization BEFORE merging. Merge ONE PR; rerun tests against updated main; rebase next branch and reverify.
7. Verify AWS Amplify Build/Deploy/Verify separately with the actual app job logs/URL. Device signoff requires real devices, not Playwright simulation.

## Known gate gaps at Phase 0
- Container direct GitHub clone failed due DNS/network policy; no local npm/build/browser runs performed for audited SHA.
- Connector observation: GitHub Actions main run list 0 and commit status checks 0; protection disabled; existing workflows have file path filters and do not run for docs-only PR.
- Static deploy tool copies index.html + src only; root assets/ and design/ not part of dist.
- No proof of live AWS or physical iOS/Android testing. These are OPEN verification needs, not confirmed failures.
