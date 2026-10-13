# Ant Kingdom — Work Board
Based on d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237. Status is truthfully DRAFT/PLANNED, not "started" or "complete" unless backed by a PR/CI/runtime evidence. Owner approval is needed to launch Wave 1.

| Task ID | Owner | Priority | Scope | Depends on | Risk | Status | Acceptance / How to test |
|---|---|---|---|---|---|---|---|
| PH0-HEAD-01 | HEAD | P0 | Audit main source/test/integration and evidence | none | medium (remote only) | Source reviewed; runtime pending | Six system documents cite exact SHA, no invented test PASS |
| PH0-HEAD-02 | HEAD | P0 | Draft plan/ownership/contracts/QA/briefs | PH0-HEAD-01 | low | Draft PR pending review | Docs-only diff; owner review |
| PH0-HEAD-03 | OWNER | P0 | Approve/adjust test-only Wave 1 | PH0-HEAD-02 | low | APPROVED 2026-10-13 (test-only) | Explicit owner authorization |
| P1-ECO-01 | AI-1 | P0 | Resource+logistics invariants tests | PH0-HEAD-03 | medium | Verified on PR #17; NO MERGE | node --test new file, npm test, npm run build; strict ledger |
| P1-AI-01 | AI-2 | P0 | Ant allocation/motion/rally state tests | PH0-HEAD-03 | medium | Investigation verified; PR #18 Draft / 2 diagnostic FAIL; NO MERGE | node --test new file; no double task/illegal steps |
| P1-UI-01 | AI-3 | P1 | Browser interaction regression harness | PH0-HEAD-03 | medium | PR #19 head e18c593 +564; responsive source fixes accepted; runtime NOT RUN; HOLD MERGE | Chromium 5 viewports, screenshots, no JS errors/overlap |
| P1-ECO-02 | AI-1 | P0 if confirmed | Fix reproduced accounting bug ONLY | P1-ECO-01 + approved allowlist | high | Not authorized | Repro red→green, full regression, exact ledger preserved |
| P1-AI-02 | AI-2 | P2 design | Dynamic Formation C — SPECIFICATION ONLY (no implementation) | P1-AI-01, Issue #21, owner design approval | medium | Design spec received; locality/capacity and transition addendum requested; implementation NOT authorized | Written design, acceptance matrix, interfaces, fallback, cost/performance analysis; no production edits |
| P1-UI-02 | AI-3 | P1 if confirmed | Fix reproduced mobile/visual bug ONLY | P1-UI-01 + approved allowlist | medium | Not authorized | Actual browser 5 viewports; no gameplay change |
| P1-HEAD-INT | HEAD | P0 | Review and one-by-one integration | accepted P1 PRs | high | Planned | CI+local+regression results differentiated; owner approval for core merge |
| P2-PERF-01 | HEAD (TBD) | P1 | Performance baseline/profile | accepted P1 regressions | medium | Proposed | 50/100/150 ants; 1/8/16/32 rooms; machine+ticks+p95 |
| P2-QA-01 | HEAD | P1 | PR CI/main protection proposal | Phase 1 audit | medium | Proposed | Owner approves config before any protection/workflow edit |
| P3-GAME-01 | TBD | P2 | Sustainability design for finite sources | P2-PERF-01 | high | Idea only | Defined resource loop, economy proof, test plan |
| P3-GAME-02 | TBD | P3 | Saves / squads / crowding, only with design | P2/P3 review | high | Idea only | Separate approved architecture and prototype |

## Actual contributor progress at creation
AI-1: PR #17 verified by HEAD on 2026-10-13. Commit c23f02da37290888301c6be63e57f75cecddd2b7; changed 1 permitted test file (+397); U5 and U6 Actions 109/109 pass, build and browser green; standalone test-file command not independently run; no merge approval.
AI-2: Investigation follow-up reviewed by HEAD on 2026-10-13; PR #18 Draft, head 4e09c99c9d28e6f2ad3db99525b676451b0c42f1; exactly 1 authorized test file +403. U5/U6 CI: 116 total, 114 pass, 2 fail. PATH-01 synthetic-only P3/Low deferred; FORM-01 duplicate target P2/Medium with supplemental in-memory soldier overlap reported but not independently reproduced by HEAD; owner approved Dynamic Formation C design only; no production implementation authorization. Remaining 97 preexisting cases pass; build/browser SKIPPED; standalone command NOT RUN. No production changes or merge.
AI-3: PR #19 latest e18c593aa9d9ffbe47f5672a87f878d18f584641; exactly one permitted file tools/browser-phase1-ui-audit.py (+564). Browser responsive camera and rally hidden-control mismatches corrected in source; previous room positive/negative test fix retained. HEAD re-review 5499067216; no head workflow, direct checkout DNS failed, 0/5 viewports, current-head syntax/npm/build/browser scripts NOT RUN. QA issue #22 updated. PR Draft, NO MERGE.
HEAD: source-level inspection and new plan draft; local/CI/browser/AWS verification NOT completed.

## Pull request control
PR description must include Task ID, baseline main SHA, exact changed files, test commands/output and failures, before/after behavior, rollback, risks, approvals needed. New work uses one short-lived branch per task: work/simulation-P1-ECO-01, work/gameplay-P1-AI-01, work/visual-P1-UI-01. No writes to main; no overlapping file edits; Head approves each merge separately.

## Bug escalation record
Use ID/owner/priority/affected system/seed/main SHA/steps/ticks/expected/actual/logs or screenshots/root-cause hypothesis/blocked file/dependency. Unconfirmed issue: label Suspected and DO NOT call reproducible.

## Decision record — 2026-10-13
Owner explicitly approved Phase 0 plan and Wave 1 **test-only** work. AI-1/2/3 are authorized to create ONLY their exact new test/harness files on task branches. Core gameplay edits, shared files and any important merges remain UNAPPROVED. AI-HEAD has NOT launched independent contributor sessions, and no contributor PR is yet recorded by this decision. Phase 0 PR #16 remains Draft; no merge approval was given.

## HEAD verification log — P1-ECO-01 (2026-10-13)
- PR: https://github.com/tanawutmalirum29-ux/ant-project/pull/17; reviewer comment/review ID 5498856126.
- Commit c23f02da37290888301c6be63e57f75cecddd2b7, baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237, diff contains only tests/economy-accounting.audit.test.mjs (+397 lines).
- Source reviewed; ECO-01 through ECO-12 passed in U5 Actions run 38346615774 and U6 run 38346615771; 109/109 tests, builds successful, browser jobs successful.
- Exact standalone node --test test file command NOT independently evidenced (included by npm test glob). No new verified gameplay bug. Additional population/device/AWS gates NOT checked.
- Gate status: Verified on PR for test-only scope; HOLD MERGE pending owner and HEAD integration approval. No authorization for any production code changes.

## HEAD verification log — P1-AI-01 (2026-10-13)
- Draft PR: https://github.com/tanawutmalirum29-ux/ant-project/pull/18; HEAD review ID 5498882109; baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237, head 4e09c99c9d28e6f2ad3db99525b676451b0c42f1.
- Diff: ONLY tests/gameplay-allocation.audit.test.mjs (+403 lines), no gameplay/config edits.
- CI evidence: U5 run 38346730480 and U6 run 38346730483 both 114/116; two deterministic failing new tests B3/C4; 97 old tests passed. Build and browser steps SKIPPED, standalone file command not independently run.
- PATH-01 https://github.com/tanawutmalirum29-ux/ant-project/issues/20 : reproduced with synthetic ROCK injection mid-step; Colony.tick path commit lacks walkability re-check; normal gameplay reachability NOT established. Investigation only.
- FORM-01 https://github.com/tanawutmalirum29-ux/ant-project/issues/21 : 14th soldier reuses 13-offset formation goal; unique-goal requirement and fallback NOT approved. Design decision only.
- Gate status: TEST-ONLY EVIDENCE VERIFIED / Needs Investigation / DRAFT PR; HOLD MERGE; follow-up read-only, never silently edit assertions to green. Core fix task P1-AI-02 remains NOT AUTHORIZED.

## HEAD verification log — P1-UI-01 (2026-10-13)
- Draft PR https://github.com/tanawutmalirum29-ux/ant-project/pull/19; HEAD review ID 5498915840. Base d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237; head d1a8271d6763d449eb09729259aee26a5acf59dd.
- Exact diff: ONLY tools/browser-phase1-ui-audit.py (+426 lines). Code read; bundled production browser test covers 5 viewports/pointer/camera/room/selection/combat/error collection.
- QA issue https://github.com/tanawutmalirum29-ux/ant-project/issues/22; no Actions run for PR head because existing workflow path filters exclude new script. Runtime NOT RUN. Runner Github clone blocked by DNS; no screenshots or console results. npm test/build and existing browser tests on this PR NOT VERIFIED.
- Review concern: room_gameplay passes when placement is rejected with any toast; must separately prove one successful queue and rejection in test-only file if deterministic feasible.
- Gate: TEST-ONLY FILE OWNERSHIP VERIFIED; QA BLOCKED / KEEP DRAFT / NO MERGE. No permission to modify gameplay, UI, or workflows.

## HEAD final investigation triage — AI-2 / P1-AI-01 (2026-10-13)
- Examined AI-2 read-only follow-up report and baseline core/UI code; PR #18 head unchanged and main unchanged. PR HEAD comment 6138505923.
- PATH-01 (Issue #20, decision comment 6138502344): synthetic terrain mutation mid-movement has confirmed conditional bug in Colony.tick but no production route to close walkable tunnels found; current-game priority **P3/Low deferred**, not a verified user-reachable blocker. Potential stale job.workerId if dig target is externally invalidated remains suspected without runtime reproduction.
- FORM-01 (Issue #21, decision comment 6138502810): 14 soldiers get 13 distinct goals due fixed offset list. AI-2 reports actual coordinate overlap in in-memory core simulation (tick 6–35, ralliedCount 14/14), but HEAD did not independently run that particular reproduction. Priority **P2/Medium**, requires owner design choice; HEAD recommends unique deterministic dynamic reachable formation and standby overflow, not yet approved.
- Decision: follow-up investigation accepted, red audit assertions preserved as evidence, **PR #18 remains Draft and unmergeable by policy** pending future explicit authorization. P1-AI-02 Gameplay changes NOT authorized; AI-2 no further code tasks at this stage.

## Owner decision — P1-AI-02 Dynamic Formation C (2026-10-13)
- Explicit OWNER approval: DESIGN AND PLAN ONLY for Dynamic Formation C; this permits AI-2 to analyze and write a reviewable specification, NOT to implement Production changes, alter the gameplay, merge PRs, or modify GitHub Actions.
- Scope goals: one distinct reachable formation destination per soldier when capacity permits; deterministic expanding ordering; overflow soldiers in clearly defined standby (not counted as rallied); preserve recruitment, rally, defend, retreat, attack, portal and pause semantics; invalidate cached assignments on real state changes; account for tile topology changes; avoid per-tick repeated pathfinding; provide backward compatibility and rollback plan. A unique goal does not by itself guarantee mid-route no-overlap; treat broad collision/crowding as a separately scoped design issue.
- AI-2 to submit design report in conversation/PR comment without committing any code or editing a repository file. Include before/after interface contract, impacted files (proposed likely src/core/combat.js; src/ui/combat-controls.js only if separately authorized), deterministic placement/overflow behavior, invalidation/caching model, test matrix 0/1/2/13/14/50/150, cramped/unreachable/portal/retreat/death/new births/pause/reset, performance benchmark plan and implementation allowlist request.
- P1-AI-02 implementation remains BLOCKED pending owner approval of exact changes and integration sequencing. PR #18 remains Draft with failing audit assertions. Existing PATH-01 P3 deferred; not in approved Formation C design scope.

## HEAD re-review — AI-3 / P1-UI-01 (2026-10-13)
- Draft PR #19: new head 62fbbc9ef9bb3b8dcbcfffc52b9e9f32cfc3d015; only tools/browser-phase1-ui-audit.py (+497) changed; main unchanged. HEAD review ID 5499001728 and QA Issue #22 comment 6138592640.
- Source-level ROOM SUCCESS and ROOM REJECT test separation now implemented using real canvas touch/click, queue increment, room record, overlap and exact toast; no runtime claims.
- Source-confirmed test-harness mismatch: navigation() tries to click hidden zoom/recenter controls on small/portrait mobile and landscape phone due CSS .control-stack display:none. rally() likewise tries to click hidden recenter. AI-3 must correct script-only branches and preserve actual mobile pinch/pan/rally coverage, no force-click or game CSS changes.
- Head review runner likewise lacked GitHub DNS access; did NOT run the full game. No PR head CI workflow triggered; new head syntax/npm/build/5-viewport/previous browser regressions unverified. Status: NEEDS REWORK (test harness) + ENVIRONMENT BLOCKED; HOLD MERGE and maintain Draft.

## HEAD combined review — AI-2 design / AI-3 UI test (2026-10-13)
- AI-3 PR #19 e18c593aa9d9ffbe47f5672a87f878d18f584641 vs main baseline: ONLY new tools/browser-phase1-ui-audit.py +564 lines. Navigation() now conditionally tests visible zoom/recenter on tablet/desktop, verifies hidden controls on mobile/landscape, actual touch/pinch preserved; rally() conditions recenter and checks actual map tap/mode/cancel/defend. HEAD review ID 5499067216. Runner direct github.com DNS failure reproduced by HEAD; no updated-head syntax, browser screenshot, build or npm test proof. QA Issue #22 comment ID 6138722713. Status SOURCE CORRECTION ACCEPTED / ENVIRONMENT QA BLOCKED / NO MERGE.
- AI-2 P1-AI-02-DESIGN submitted written Dynamic Formation C specification (user provided, not a code commit): algorithm, reachable BFS, soldier assignment, overflow/standby, cache invalidation, compatibility, benchmark, test matrix and rollback complete at draft level. HEAD Issue #21 comment ID 6138723128. Important refinement: candidate capacity currently equals all reachable tiles across entire component with no bounded local footprint; must define acceptable radius/path distance and actual standby scenarios. Also spell out stale movement cancellation and ID reallocation churn, portal eligibility, cache scope on ordinary excavation vs synthetic closures, public ralliedCount behavior. DESIGN REVIEWED / ADDENDUM REQUESTED; implementation files and tests NOT AUTHORIZED.
- Both PR #18 and #19 remain Draft. No gameplay/visual/workflow merge or Production code edits approved.
