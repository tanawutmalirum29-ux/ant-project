# Ant Kingdom — Work Board
Based on d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237. Status is truthfully DRAFT/PLANNED, not "started" or "complete" unless backed by a PR/CI/runtime evidence. Owner approval is needed to launch Wave 1.

| Task ID | Owner | Priority | Scope | Depends on | Risk | Status | Acceptance / How to test |
|---|---|---|---|---|---|---|---|
| PH0-HEAD-01 | HEAD | P0 | Audit main source/test/integration and evidence | none | medium (remote only) | Source reviewed; runtime pending | Six system documents cite exact SHA, no invented test PASS |
| PH0-HEAD-02 | HEAD | P0 | Draft plan/ownership/contracts/QA/briefs | PH0-HEAD-01 | low | Draft PR pending review | Docs-only diff; owner review |
| PH0-HEAD-03 | OWNER | P0 | Approve/adjust test-only Wave 1 | PH0-HEAD-02 | low | APPROVED 2026-10-13 (test-only) | Explicit owner authorization |
| P1-ECO-01 | AI-1 | P0 | Resource+logistics invariants tests | PH0-HEAD-03 | medium | Verified on PR #17; NO MERGE | node --test new file, npm test, npm run build; strict ledger |
| P1-AI-01 | AI-2 | P0 | Ant allocation/motion/rally state tests | PH0-HEAD-03 | medium | PR #18 Draft; evidence verified, Needs Investigation; NO MERGE | node --test new file; no double task/illegal steps |
| P1-UI-01 | AI-3 | P1 | Browser interaction regression harness | PH0-HEAD-03 | medium | Authorized; awaiting contributor PR | Chromium 5 viewports, screenshots, no JS errors/overlap |
| P1-ECO-02 | AI-1 | P0 if confirmed | Fix reproduced accounting bug ONLY | P1-ECO-01 + approved allowlist | high | Not authorized | Repro red→green, full regression, exact ledger preserved |
| P1-AI-02 | AI-2 | P0 if confirmed | Fix reproduced assignment/path/rally bug ONLY | P1-AI-01 + approved allowlist | high | Not authorized | Repro red→green; no teleport or double reservation |
| P1-UI-02 | AI-3 | P1 if confirmed | Fix reproduced mobile/visual bug ONLY | P1-UI-01 + approved allowlist | medium | Not authorized | Actual browser 5 viewports; no gameplay change |
| P1-HEAD-INT | HEAD | P0 | Review and one-by-one integration | accepted P1 PRs | high | Planned | CI+local+regression results differentiated; owner approval for core merge |
| P2-PERF-01 | HEAD (TBD) | P1 | Performance baseline/profile | accepted P1 regressions | medium | Proposed | 50/100/150 ants; 1/8/16/32 rooms; machine+ticks+p95 |
| P2-QA-01 | HEAD | P1 | PR CI/main protection proposal | Phase 1 audit | medium | Proposed | Owner approves config before any protection/workflow edit |
| P3-GAME-01 | TBD | P2 | Sustainability design for finite sources | P2-PERF-01 | high | Idea only | Defined resource loop, economy proof, test plan |
| P3-GAME-02 | TBD | P3 | Saves / squads / crowding, only with design | P2/P3 review | high | Idea only | Separate approved architecture and prototype |

## Actual contributor progress at creation
AI-1: PR #17 verified by HEAD on 2026-10-13. Commit c23f02da37290888301c6be63e57f75cecddd2b7; changed 1 permitted test file (+397); U5 and U6 Actions 109/109 pass, build and browser green; standalone test-file command not independently run; no merge approval.
AI-2: Draft PR #18, commit 4e09c99c9d28e6f2ad3db99525b676451b0c42f1; exactly 1 authorized test file +403. U5/U6 CI: 116 total, 114 pass, 2 fail (synthetic dynamic obstruction PATH-01, 14-soldier duplicate goal FORM-01). Remaining 97 preexisting cases all pass; build/browser SKIPPED and standalone command NOT RUN. No production changes, no merge.
AI-3: no PR or work evidence yet.
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
