# UI RENOVATION V1 — OWNER RELAY / THREE ENGINEER ORDERS

**STATUS: READY_TO_PREPARE / IMPLEMENTATION_HOLD UNTIL G1 FREEZE**  
This is a copyable assignment sheet. Relaying these messages does not spawn agents or make them aware of other chats automatically. Each Engineer needs the OWNER to actually relay it.

**Coordinator:** this same chat, [Issue #138](https://github.com/tanawutmalirum29-ux/ant-project/issues/138).  
**Integration:** [Draft PR #146](https://github.com/tanawutmalirum29-ux/ant-project/pull/146); branch `feat/ui-renovation-v1-integration`.  
**Plans:** [Master](UI_RENOVATION_V1_MASTER_PLAN.md), [Architecture](UI_RENOVATION_V1_CONTRACT.md), [Wireframes](UI_RENOVATION_V1_WIREFRAMES.md), [QA](UI_RENOVATION_V1_QA.md).

## OWNER → ENGINEER-A | MAIN HUD + SETTINGS

**Role:** ENGINEER-A (Engineer-1)  
**Tasks:** [UI-01 #139](https://github.com/tanawutmalirum29-ux/ant-project/issues/139) and [UI-06 #144](https://github.com/tanawutmalirum29-ux/ant-project/issues/144).  
**Goal:** Completely redesign main game screen (resource/time/speed/layer/tools/milestone/status) for all viewports, plus Settings and safe Seed/world-reset flow. Preserve map pan, dig/room button semantics, normal Seed typing and world generation. UI must be native-popup free, CSS/DOM, accessible and responsive.

**Exclusive new files:** `src/ui/renovation/home.js`, `home.css`, `settings.js`, `settings.css`, related focused tests; split into two PRs.  
**PROHIBITED shared edits:** `index.html`, `src/ui/app.js`, `src/ui/combat-controls.js`, `src/styles.css`, `src/ui/visual/*`, game core, shell. Request shared-file adapters from COORDINATOR.  
**Gate:** Read the complete plan. **Do not start implementation before Coordinator posts G1_FROZEN with integration SHA and final module API.** Then branch from that SHA, make each feature PR target `feat/ui-renovation-v1-integration` (never main).
**Finish report:** PR links, SHA, files, native/build tests, Chromium/WebKit screenshots for 320×568,390×844,568×320,844×390,768×1024,1440×900, real touch/keyboard/IME and Seed reset behavior, errors and unresolved UX issues. Handoff to OWNER for forwarding; do not report success without evidence.

## OWNER → ENGINEER-B | MILITARY + ANT MANAGEMENT

**Role:** ENGINEER-B (Engineer-2)  
**Tasks:** [UI-02 #140](https://github.com/tanawutmalirum29-ux/ant-project/issues/140) and [UI-03 #141](https://github.com/tanawutmalirum29-ux/ant-project/issues/141).  
**Goal:** Fully redesign military A/B management (HP, real roster, squad switch/transfer, defend/rally/retreat, target Cancel and map following) and ant management/inspector (Starter and five permanent professions Lv1–5, real tasks/states, multi-ant tile, follow, dead ant). Never reintroduce worker percentages or fake recruitment.

**Exclusive new files:** `src/ui/renovation/military.js`, `military.css`, `ants.js`, `ants.css`, related focused tests; two separate PRs.
**PROHIBITED shared edits:** `src/ui/combat-controls.js`, legacy `combat.css`, `src/ui/ant-inspector.js`, `src/ui/app.js`, `index.html`, game core, shell. Ask Coordinator for integration adapters.
**Gate:** **WAIT FOR G1_FROZEN**, then branch from frozen SHA and target Integration.
**Finish report:** PR SHA, test cases 0/1/150 soldiers/ants, A/B targeting, squad transfer, keyboard and touch, screenshot for narrow/landscape/tablet/desktop, negative states, overlay geometry and unresolved items. Notify OWNER for relay; no direct main merge.

## OWNER → ENGINEER-C | NURSERY + CONSTRUCTION

**Role:** ENGINEER-C (Engineer-3)  
**Tasks:** [UI-04 #142](https://github.com/tanawutmalirum29-ux/ant-project/issues/142) and [UI-05 #143](https://github.com/tanawutmalirum29-ux/ant-project/issues/143).  
**Goal:** Fully redesign Nursery room sheet (5 professions × Lv1–5, 4 real slots, costs, queue status, pickup/transport/incubation, legal cancellation, all blocked reasons) plus construction/excavation flow (room picker, 2×2 footprint, cost/path, build/blocked/cancel, dig drag add/remove). Preserve simulation and mobile canvas gestures.

**Exclusive new files:** `src/ui/renovation/nursery.js`, `nursery.css`, `rooms.js`, `rooms.css`, related focused tests; two PRs.
**PROHIBITED shared edits:** `src/ui/app.js`, `index.html`, `src/ui/visual/nursery.css`, `room-picker.js`, `game-choice.js/css`, `src/core/*`, shell. Ask Coordinator for needed adapters.
**Gate:** **WAIT FOR G1_FROZEN**, branch from its SHA; target Integration.
**Finish report:** exact PR/SHA, state variants (queen dead/room blocked/stock/150-cap/4-full), queue/cancel/refund, 25 choices, valid/invalid build/cancel, dig drag and tap targets, all viewport screenshots/QA; handoff via OWNER only.

## COORDINATOR HANDOFF STEP

After the Coordinator implements #138, posts the actual G1_FROZEN SHA/API, and confirms baseline QA, OWNER may forward the above orders (or updated ones) to their three independent engineer chats. The Engineers must not claim work began based only on this file's existence.

After the first feature PRs, the Coordinator alone integrates the six views, migrates legacy DOM/CSS, runs all cross-panel and full regression checks; independent reviewer handles #145 before any PR #146 main merge. At end, close issues and review branch cleanup. **No work has been implemented in the new UI by this planning sheet.**
