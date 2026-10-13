# Ant Kingdom — Round 2 Work Board / File Ownership

> **ACTIVE round starting 2026-10-13.** Historical pre-planning gameplay base: `615fac2b8cbffbc498f98c9aef0b13b03ec9a750`. **Start every actual agent work branch from current `main` after docs PR #27 merge, which contains report templates.** Always re-verify branch and SHA; previous Wave-1 assignments are retired. The successor AI-HEAD may update this board as work proceeds, but contributors edit only their assigned report file and source/test allowlist.

## Parallel assignments

| Task | Responsible | Scope / exact allowed paths | Source of status | Entry gate | Exit gate |
|---|---|---|---|---|---|
| R2-SIM-01 | AI-1 | `src/core/colony.js`, CREATE `tests/colony-path-guard.test.mjs`, `docs/ai-reports/AI-1/ROUND_02.md` | [Issue #23](https://github.com/tanawutmalirum29-ux/ant-project/issues/23) | Start from pinned main, reproduce B3 | PATH-01 green, job ownership/cardinal validity, build/economy regression evidence |
| R2-COMBAT-01 | AI-2 | `src/core/combat.js`, CREATE `tests/formation-dynamic.test.mjs`, `docs/ai-reports/AI-2/ROUND_02.md` | [Issue #24](https://github.com/tanawutmalirum29-ux/ant-project/issues/24) | Stage 0 contract freeze by **new HEAD before production writes** | FORM-01 green, dynamic formation QA 0–150, portal/capacity/cache/retreat, build evidence |
| R2-UIQA-01 | AI-3 | `tools/browser-phase1-ui-audit.py` ONLY if real harness defect is proven, `docs/ai-reports/AI-3/ROUND_02.md` | [Issue #25](https://github.com/tanawutmalirum29-ux/ant-project/issues/25) | Accessible real repository checkout + Chromium; if blocked report once | Honest 5-viewports results/screenshots/JS errors, npm/build, legacy scripts or precise outstanding blocker |
| R2-HEAD | New AI-HEAD | `docs/development/ROUND_02_*.md`, `docs/development/NEXT_HEAD_HANDOFF.md`, Issue #26; integration only | [Issue #26](https://github.com/tanawutmalirum29-ux/ant-project/issues/26) | Verify current main, own issue/report links | Per-task acceptance; merge serially; refresh main, record QA debt/owner decisions |

**All other paths are READ-ONLY**: including `src/core/game.js`, `src/main.js`, `src/core/rooms.js`, `src/core/foraging.js`, `src/core/lifecycle.js`, `src/world/**`, `src/ui/**`, `index.html`, `package.json`, `README.md`, `tools/build.mjs`, `.github/workflows/**`, `amplify.yml`, old test files and all other docs. No inherited wildcard file permission from historic board.

## Report inboxes — required every active round

- AI-1 **permanent report path for R2:** [AI-1/ROUND_02.md](../ai-reports/AI-1/ROUND_02.md); live Issue #23 comments.
- AI-2 **permanent report path for R2:** [AI-2/ROUND_02.md](../ai-reports/AI-2/ROUND_02.md); live Issue #24 comments.
- AI-3 **permanent report path for R2:** [AI-3/ROUND_02.md](../ai-reports/AI-3/ROUND_02.md); live Issue #25 comments.
- New AI-HEAD reads all three issues **before** PR reviews, report files in each branch PR, and logs decisions/merges into Issue #26. On next round create `ROUND_03.md` in each agent folder; do not overwrite Round 2 report/history.

### Reporter required sections

1. Task/status: `Not Started | In Progress | Needs Rework | Verified on PR | Blocked | Done after merge`.
2. Baseline/main SHA, branch name, HEAD SHA, PR/Issue URLs and exact files modified.
3. Repro/changes: what was done, actual before/after effect, no unapproved changes.
4. Tests: command, exit code, cases, environment, result, known red vs new red; do not report NOT_RUN as PASS.
5. Evidence: Github Actions links, terminal logs, JSON, screenshots for UI, screenshot count and JS console error status. Artifacts outside repo except small textual report.
6. Blockers, proposed workaround, next decision required from new HEAD, next step.

Agent must commit an update to **own report path on own work branch** during task and on final submission, and post the same milestone summary on the task Issue immediately. Unmerged branch report is read through the PR's Files Changed; Issue comments are source of the latest visible live report. No agent may edit or overwrite another's report.

## Stage and integration policy

- **Stage A (parallel):** AI-1 diagnosis→focused fix + tests, AI-2 design contract freeze request (no production code before HEAD reply)→formation code + tests, AI-3 real browser QA/triage. Each sends issue update and report before asking review.
- **Stage B (serial):** new HEAD verifies AI-1 first, then AI-2, then AI-3 harness edits if any; rebase/re-test after main changes. Do not merge failing PRs merely to make progress without explicit owner decision.
- **Stage C:** verify joined main, document remaining QA/deployment blocker separately and seek owner signoff on next UX phase.
- **Required commands:** `git diff --name-only <base>...HEAD`; `npm test`; `npm run build`; targeted node tests and browser scripts where applicable; confirm exact SHA and environment. If baseline is red, compare baseline and branch by case IDs to identify newly introduced failures.

**Open debts:** [PATH-01 #20](https://github.com/tanawutmalirum29-ux/ant-project/issues/20), [FORM-01 #21](https://github.com/tanawutmalirum29-ux/ant-project/issues/21), [Browser QA #22](https://github.com/tanawutmalirum29-ux/ant-project/issues/22). No issue is closed by drafting a plan.
