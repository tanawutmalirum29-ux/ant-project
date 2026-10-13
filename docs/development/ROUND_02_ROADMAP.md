# Ant Kingdom — Development Roadmap (Round 2 onward)

> **Current authoritative plan** as of 2026-10-13. Previous `MASTER_PLAN.md`, `WORK_BOARD.md`, `AI_BRIEFS.md`, `FILE_OWNERSHIP.md` are HISTORY, not current assignment authority. Game development remains ACTIVE. New AI-HEAD owns subsequent revisions.
>
> **Audited gameplay baseline before Round 2 planning:** `615fac2b8cbffbc498f98c9aef0b13b03ec9a750`. **Every Round-2 agent MUST branch from current `main` AFTER planning PR #27 was merged**, because that commit provides the permanent report templates. Use `git fetch origin main` and record the real current SHA before branch creation and merges; do not branch from historical gameplay baseline missing report files. This document describes development priorities; it does NOT prove tests passed.

## Game vision / playable loop

Ant Kingdom is an existing 2D single-player web simulation using ES modules, Canvas 2D and CSS. Player manages an underground nest: excavate reachable corridors → construct specialized rooms with real workers/material reservations → send ants to forage at finite surface resources → store and consume resources → care for brood and expand the workforce → assign workers/soldiers and defend/rally through actual paths and portals.

**Protect first:** determinism by world seed and ordered events; ten fixed simulation ticks/second (render independent); pause; a single physical portal pair; four-neighbor walkable movement; one owner per job; no ant creation on recruitment; resource mass conservation including node amount, worker cargo, deposited inventory, held/spent, consumed and lost; per-room capacities, life/death cleanup and stable UI action controls.

**Current supported systems:** maps surface 128×128, underground 96×64; excavation and queued work, foraging, lifecycle, rooms, military, threats, 5-size responsive UI. The source and system design are summarized in README.md and docs/GAME_SYSTEMS.md. No save/load, multi-squad, per-ant occupancy, or renewable-resource loop implemented. Do not market these as completed.

## Quality debt brought into Round 2

| ID | Evidence and consequence | Priority / owner |
|---|---|---|
| PATH-01 #20 | Deterministic synthetic test B3 reproduces miner committing an already-selected step after terrain becomes ROCK. No ordinary player-reachable terrain-closing control confirmed. Affects all-tests CI. | R2-SIM-01 / AI-1 |
| FORM-01 #21 | Deterministic test C4 reproduces 14th soldier sharing a formation destination because 13 offsets wrap. Earlier test CI had 114/116 pass; Dynamic Formation C technical design accepted only at design-review level. | R2-COMBAT-01 / AI-2 |
| Browser QA #22 | Merged 5-viewport harness `tools/browser-phase1-ui-audit.py`, but no full checked-out Chromium execution/screenshot/JS-error evidence; repeated runner DNS failures. | R2-UIQA-01 / AI-3 |
| Integration | Existing workflows are path-filtered; no main-branch Actions run visible in last HEAD checkpoint. Build != deploy != physical phone. | New AI-HEAD |

Do not delete/skip known failing assertions, patch tests to force green, or mark NOT_RUN as PASS.

## R2 — Gameplay Stabilization (START NOW; 3 parallel non-overlapping branches)

1. **AI-1 / R2-SIM-01 / Issue #23:** Guard in-flight miner movement before committing blocked terrain; protect dig order ownership. Exact `src/core/colony.js`, new `tests/colony-path-guard.test.mjs`, own report. Existing PATH-01 must turn green, with no new economic regressions. No general terrain mutation framework.
2. **AI-2 / R2-COMBAT-01 / Issue #24:** Deliver bounded Dynamic Formation C. Existing `src/core/combat.js`, new `tests/formation-dynamic.test.mjs`, own report. **Stage 0:** new HEAD freezes public behavior parameters before code. Proposed R8 Chebyshev + shortest path D12; valid unique slots, stable goal reservation, reachable portal handling, standby, null-safe getter, active-only arrived tally, cache. Existing FORM-01 must become green. Do not change UI/terrain or damage/retreat rules.
3. **AI-3 / R2-UIQA-01 / Issue #25:** Actually run merged real-game Playwright harness and legacy browser regressions at five viewports; triage UI issues. May change `tools/browser-phase1-ui-audit.py` only if reproducible harness defect exists; own report. No production UI change authorized yet.

**R2 integration finish conditions:** reproducible `npm test` and `npm run build` on exact integrated main; PATH-01 and FORM-01 green without weakening old tests; no new failures in economy/lifecycle/rooms/combat; actual Chromium 320×568, 390×844, 768×1024, 844×390, 1440×900 evidence (or explicitly outstanding QA blocker); all three agents maintain their own GitHub report issue+file. Never call R2 VERIFIED if the browser gate remains NOT RUN.

## R3 — Player control and accessible UI (PLAN ONLY; not delegated yet)

Focus on how the player manages the colony rather than decorative overhaul: intelligible dig/room placement confirmation and cancellation, actionable room/worker shortage messages, non-obstructive selection/debug/military overlays at supported mobile sizes, roster statuses and ability to understand Assigned/Arrived/Standby/Unreachable. Preserve `#room-type` authoritative selection and existing DOM IDs; avoid duplicated game simulation logic. Test in real browser before implementing. Exact UI file ownership granted only via new HEAD task and issue; coordinate combat read-only contract before introducing status labels.

**Exit:** player can issue digging, building, forage/nurse, rally and defend without hidden/conflicting controls on all five target sizes; success/failed actions have unambiguous feedback, regression screenshots and real input evidence.

## R4 — Long-term colony gameplay (DESIGN and balance gate first)

Study finite surface resource depletion, renewable/reseeded sources, sustainable brood/population balance, worker/forager efficiency, meaningful room progression and colony threats. Require conservation/accounting model, finite-vs-renewable policy, deterministic seeded repeatability and progression playtest before changing `src/world/resources.js`, `src/core/foraging.js`, `src/core/lifecycle.js` or room catalog. Do not spawn free resources silently or use `rooms.syncInventory` as production minting. Define minimum 30-minute simulated session test, actual viability metric and economy ledger gate. No code permission until decision.

## R5 — Save/Load, scale and content (PLAN ONLY)

Design a versioned, deterministic world-state save schema with migration and checksum before persistence; verify reset does not carry stale cached entities, pending reservations or listener duplicates. Then benchmark 5/50/100/150 ants, 1/8/16/32 rooms and 0/100/600 dig orders, measure tick p50/p95, pathfinding and heap on declared hardware, and optimize only demonstrated hot spots. Independent squads, colony tech/progression, richer animations and balance features come later as individually scoped design decisions.

## R6 — Delivery confidence

Run all tests and real-browser smoke before release, independently verify AWS Amplify job (BUILD→DEPLOY→VERIFY) and actual target site; physical-phone signoff is separate. Preserve documentation on exact main/deployed commit and unverified limitations.

## Leadership and merge policy

- **Owner:** final game priorities, major gameplay/UI/API decisions and release approval.
- **Successor AI-HEAD:** sole integrator and reviewer; prepares freeze/allowlists, reads Issues #23/#24/#25 and report files, manages dependent merges, and maintains Issue #26 decision log. HEAD may revise roadmap after recording why.
- **AI-1, AI-2, AI-3:** one task/branch each, exact allowed paths, frequent issue updates + per-agent report file, Draft PR, never merge or modify main.
- Agent code branches start from CURRENT `main` containing the Round 2 report templates (not from historical `615fac2...`); before merge successor HEAD checks current main and rebuilds/rebases if necessary, runs critical gates, records actual outcomes and after each merge takes a new main SHA. One PR at a time. Distinguish green targeted tests from full green.
- **Blocked runtime:** one evidence-rich report then ask new HEAD to route to checkout-capable environment; no repeated DNS logs as fake progress.
- **Cross-scope edits:** STOP and post a request in the agent Issue; no guessing or silent changes.
- Historical docs are reference only; this plan plus its R2 work board and latest HEAD decisions supersede the old task plan.

**Current task board:** [ROUND_02_WORK_BOARD.md](ROUND_02_WORK_BOARD.md) · **Next-head transfer:** [NEXT_HEAD_HANDOFF.md](NEXT_HEAD_HANDOFF.md) · **Report index:** [../ai-reports/README.md](../ai-reports/README.md)
