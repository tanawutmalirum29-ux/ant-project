# Ant Kingdom — AI-HEAD Succession Handoff (2026-10-13)

> **READ THIS FIRST in the new AI-HEAD chat.** This handoff closes the old leadership conversation, **not** the Ant Kingdom project. The next ChatGPT session assumes the operational AI-HEAD role after the owner shares this document/prompt; the old assistant cannot transfer persistent chat state automatically. New HEAD re-verifies GitHub on entry and reports its actual current SHA.

## Repository and live source of truth

Repository: https://github.com/tanawutmalirum29-ux/ant-project

**At handoff, main:** `615fac2b8cbffbc498f98c9aef0b13b03ec9a750` (owner-directed consolidation of previous work). Later commits to main, including the R2 planning docs merge, require re-reading the current ref; this SHA is the **R2 contributor starting base**, not a claim that main can never advance.

**Merged 2026-10-13:** PR #17 economy audit → `3ab15b1`; PR #19 browser harness → `5de999d`; PR #18 gameplay audit → `00c7ab5`; PR #16 Phase-0 docs → `615fac2`. GitHub compare from pre-merge base showed **only 7 documentation files, 2 test files, and 1 browser script**, no changes to production JS/CSS or workflow. Previous legacy docs `MASTER_PLAN.md`, `WORK_BOARD.md`, `AI_BRIEFS.md`, `FILE_OWNERSHIP.md` are historic only.

**Current planning docs:** [ROUND_02_ROADMAP.md](ROUND_02_ROADMAP.md) and [ROUND_02_WORK_BOARD.md](ROUND_02_WORK_BOARD.md). README.md and docs/GAME_SYSTEMS.md contain actual game systems and limitations. Source contracts and QA protocol in `INTEGRATION_CONTRACTS.md`, `QA_PROTOCOL.md` are earlier audit references, not proof of runtime pass.

## State of the playable game

2D single-player Canvas web game. Seeded surface 128x128 and underground 96x64; 10TPS fixed Game step. Core sequence: Colony → Foraging → Rooms → Lifecycle → Combat. Ants dig reachable cells, collect surface carbs/protein/water, deposit in connected storage, consume and reproduce, construct rooms, enlist/defend/rally soldiers and fight enemies. Touch/mobile HUD and CSS room picker implemented, but full five-viewport runtime validation is pending. No native save/load, multiple independent armies, full ant collision avoidance or renewable long-term forage yet.

## Honest QA state — do not erase

1. **Issue #20 PATH-01 / P3 synthetic, confirmed**: B3 in `tests/gameplay-allocation.audit.test.mjs` blocks an in-flight mine step by direct `writeCell`; code `src/core/colony.js` may commit into blocked terrain after selecting `ant.next`. Natural player path to closure has not been confirmed. Assigned AI-1.
2. **Issue #21 FORM-01 / P2 confirmed**: 14 soldiers have a duplicate formation goal when 13-offset cycle wraps. C4 in same merged test file fails; Dynamic Formation C design had HEAD technical approval **only for design**. New HEAD must freeze its gameplay/API contract before AI-2 implementation. Assigned AI-2.
3. **Issue #22 Browser QA evidence missing**: source-reviewed `tools/browser-phase1-ui-audit.py` merged; runner DNS inability to clone produced a ZIP of `NOT_RUN` outcomes (0/5 real viewports, no game screenshots, JS errors unknown). Assigned AI-3.
4. **Main all-tests CI currently unverified**: PR #17 previously had U5 and U6 green 109/109; PR #18 previously had 114/116 with 2 known fails. No main-branch Actions runs visible at outgoing HEAD checkpoint. Expect red until #20/#21 addressed; do not claim actual main failure without main run evidence. No AWS/physical-device release verification established.

## Incoming NEW work and GitHub report responsibilities

| Agent | Task | Permanent Issue progress inbox | Per-round report file |
|---|---|---|---|
| AI-1 | R2-SIM-01 safe miner movement / PATH-01 | [#23](https://github.com/tanawutmalirum29-ux/ant-project/issues/23) | `docs/ai-reports/AI-1/ROUND_02.md` |
| AI-2 | R2-COMBAT-01 bounded Formation C / FORM-01, contract-first | [#24](https://github.com/tanawutmalirum29-ux/ant-project/issues/24) | `docs/ai-reports/AI-2/ROUND_02.md` |
| AI-3 | R2-UIQA-01 real Browser QA, triage | [#25](https://github.com/tanawutmalirum29-ux/ant-project/issues/25) | `docs/ai-reports/AI-3/ROUND_02.md` |
| NEW HEAD | Contract decisions, owner approvals, integration and next roadmap | [#26](https://github.com/tanawutmalirum29-ux/ant-project/issues/26) | `docs/development/ROUND_02_WORK_BOARD.md` |

**Reports live on GitHub:** each AI must maintain *its own file* on its feature branch, and post each substantive milestone as a comment under its personal Issue. New HEAD reads all Issues first, then sees unmerged file updates in the agent PR, and checks evidence (not assertions about evidence) before authorizing merges. Do not ask three agents to edit one common status table concurrently.

## New HEAD's first operational actions

1. Get current `main` ref and inspect README.md, docs/GAME_SYSTEMS.md, latest R2 docs, three report templates and Issues #20–#26. Ensure existing PRs #16–#19 are actually merged and no unexpected branches/PRs supersede this assignment.
2. Confirm and **freeze R2-COMBAT-01's proposed design in Issue #24** before production edits. Proposal: Hybrid Chebyshev radius 8 plus path length 12; reachable unique target slots; legacy 13 first; preserve-valid-goals with deterministic event sequence; standby/unreachable null goal; strict actual portal; getter no per-call BFS/A*; arrived tally only active Rally; `setRally` preserves preexisting reset-on-success unless a deliberate owner-approved change. Public `ralliedCount` is a behavioral change; if owner has not agreed, request owner decision prior to implementation/merge. No source changes to terrain or UI.
3. Receive AI-1/AI-2/AI-3 progress via Issues #23/#24/#25 and per-agent report files; establish actual runner and distinguish runtime unavailability. Update Issue #26 as integration diary with decisions and evidence.
4. Review exact changed files against R2 allowlist. Verify tests/build and real browser independently where feasible. Merge only one PR at a time, rebase/retest dependent changes, confirm after-merge main SHA, do not suppress old diagnostic tests.
5. At R2 closure write truthful completion report, then assign R3 player UX improvements, R4 sustainable resources/balance, R5 versioned save/load/performance after separate design gates. No unapproved feature scope creep.

## Governance / escalation

Owner is final authority on changing major game mechanics, saving, network/multiplayer, UX redesign, APIs that affect visible behavior, deployment and accepting unverified release gates. New HEAD controls technical review, scoped day-to-day assignments, report cadence and single-merge integration. AI-1/2/3 **NEVER** merge or push to main. Any request to modify an unlisted file requires new HEAD written approval and updated issue; common entry points `src/main.js`, `src/core/game.js`, `index.html`, `package.json`, deployment and workflow files are HEAD-controlled.

Never conflate merged with tested, build with AWS deploy, or source read with real-browser validation. Retain PATH-01, FORM-01, Browser QA issues until evidence supports closure. Do not restart old Wave 1 assignments; they are already merged.

## Outgoing AI-HEAD sign-off

The outgoing HEAD's remit ends after preparing this R2 transition and linking reports/issues. Nothing in these documents asserts that code was implemented or that the next chat has already acted. **Next HEAD must independently verify current GitHub state at takeover.** If this handoff doc has been merged via a planning PR, that is a docs-only organizational handoff, not an engine release.

**Communication to owner:** paste the successor-role instruction delivered with this handoff into a NEW ChatGPT session connected to GitHub and forward the three worker assignments. Then review future progress against Issue #26.
