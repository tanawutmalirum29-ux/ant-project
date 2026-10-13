# Ant Kingdom — Work Board
Based on d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237. Status is truthfully DRAFT/PLANNED, not "started" or "complete" unless backed by a PR/CI/runtime evidence. Owner approval is needed to launch Wave 1.

| Task ID | Owner | Priority | Scope | Depends on | Risk | Status | Acceptance / How to test |
|---|---|---|---|---|---|---|---|
| PH0-HEAD-01 | HEAD | P0 | Audit main source/test/integration and evidence | none | medium (remote only) | Source reviewed; runtime pending | Six system documents cite exact SHA, no invented test PASS |
| PH0-HEAD-02 | HEAD | P0 | Draft plan/ownership/contracts/QA/briefs | PH0-HEAD-01 | low | Draft PR pending review | Docs-only diff; owner review |
| PH0-HEAD-03 | OWNER | P0 | Approve/adjust test-only Wave 1 | PH0-HEAD-02 | low | APPROVED 2026-10-13 (test-only) | Explicit owner authorization |
| P1-ECO-01 | AI-1 | P0 | Resource+logistics invariants tests | PH0-HEAD-03 | medium | Authorized; awaiting contributor PR | node --test new file, npm test, npm run build; strict ledger |
| P1-AI-01 | AI-2 | P0 | Ant allocation/motion/rally state tests | PH0-HEAD-03 | medium | Authorized; awaiting contributor PR | node --test new file; no double task/illegal steps |
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
AI-1: no PR or work evidence yet.
AI-2: no PR or work evidence yet.
AI-3: no PR or work evidence yet.
HEAD: source-level inspection and new plan draft; local/CI/browser/AWS verification NOT completed.

## Pull request control
PR description must include Task ID, baseline main SHA, exact changed files, test commands/output and failures, before/after behavior, rollback, risks, approvals needed. New work uses one short-lived branch per task: work/simulation-P1-ECO-01, work/gameplay-P1-AI-01, work/visual-P1-UI-01. No writes to main; no overlapping file edits; Head approves each merge separately.

## Bug escalation record
Use ID/owner/priority/affected system/seed/main SHA/steps/ticks/expected/actual/logs or screenshots/root-cause hypothesis/blocked file/dependency. Unconfirmed issue: label Suspected and DO NOT call reproducible.

## Decision record — 2026-10-13
Owner explicitly approved Phase 0 plan and Wave 1 **test-only** work. AI-1/2/3 are authorized to create ONLY their exact new test/harness files on task branches. Core gameplay edits, shared files and any important merges remain UNAPPROVED. AI-HEAD has NOT launched independent contributor sessions, and no contributor PR is yet recorded by this decision. Phase 0 PR #16 remains Draft; no merge approval was given.
