# AI-2 — Round 02 / R2-COMBAT-01: Dynamic Formation C

**Date:** 2026-10-13 (Asia/Bangkok, UTC+7)
**Task:** R2-COMBAT-01 / FORM-01
**Issue:** https://github.com/tanawutmalirum29-ux/ant-project/issues/24
**Authorization:** AI-HEAD Issue comments `6139289025` and `6139435346` — APPROVED, earlier owner gate superseded.
**Verified main base:** `1a3e8038e81e5c3cbca1efe67c999c63746169ee`
**Branch:** `work/r2-ai2-dynamic-formation`
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/30 (OPEN / DRAFT / UNMERGED)
**Latest source/test commit:** `54751ef0c36db82e1f1d6c8e37f976844d102aa2` (this report update will add a documentation commit)

## Scope / exact changed files

1. `src/core/combat.js` — production change only.
2. `tests/formation-dynamic.test.mjs` — new test.
3. `docs/ai-reports/AI-2/ROUND_02.md` — this report.

No UI, world, colony, existing tests, workflow, or main changes.

## Contract and implementation

- `setRally(layer,x,y): boolean` rejects inaccessible/invalid target without side effects; success preserves the existing motion reset, including same-center.
- `getRallyGoal(ant): {layer,x,y}|null` now reserves one unique target for each reachable soldier, or null for no valid target, non-soldiers, standby/unreachable.
- `getFormationStatus(ant): 'Assigned'|'Standby'|'Unreachable'|null` reports the assignment state, without changing the UI.
- `ralliedCount: number` is zero outside Rally and counts only genuinely arrived soldiers, with no in-flight step, and not intercepting, attacking, or retreating.
- Formation slots: bounded 4-way BFS from rally center, Chebyshev <=8 and shortest cardinal path <=12, with valid historical 13-slot order before stable distance/coordinate expansion.
- Stable identity reservations: retain valid goals for surviving soldier objects; assign free slots in natural stable ID order; avoid duplicates; physically disconnected soldiers cannot reserve slots.
- Cross-layer reachability is checked against the **actual paired entrance** used by soldier movement; never bypass portals or teleport. Normal `walk`, `crossPortal`, HP, enemy damage, cooldown, guard, recovery remain unchanged.
- Cached geometry, source/target connectivity and reservations are reconciled on rally-center/world identity, roster changes, and `colony.completed` revision (regular digs). **Direct synthetic writeCell** without completion is expressly unsupported as an invalidation event.
- `soldierTick` guards null before reading layer, and clears obsolete motion if no rally destination.

## Actual validation — Red → Green (CI verified)

**Original unchanged FORM-01 C4:** reproduced RED in [pre-fix U6 run 38346730483](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38346730483), 2026-10-13 04:30 UTC: 116 tests, 114 PASS / **2 FAIL** (C4 duplicated 14th formation goal and independent B3 PATH-01). Corresponding old commit `4e09c99c9d28e6f2ad3db99525b676451b0c42f1`.

**New branch:** C4 becomes **GREEN without editing the old audit test**. Full U6 `npm test` on source/test commit `54751ef0c36db82e1f1d6c8e37f976844d102aa2`: 142 tests, **141 PASS / 1 FAIL**, solely inherited B3 PATH-01. All **14/14 R2-FORM new tests PASS** (including the build-gate test). All existing C3–C8 PASS. This is a real CI result, **not** a claim that `npm test` exits zero.

| Command / case | Actual exit | PASS / FAIL | Evidence |
|---|---|---|---|
| Local `git ls-remote ... HEAD` | **128** | DNS BLOCKED | `Could not resolve host: github.com` in agent container |
| `npm test` U6 workflow (Node 22, Ubuntu) | **1** | 141 / 1, PATH-01 B3 only | [U6 run 38356877013](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356877013), job `115161726066` |
| `npm test` U5 workflow (Node 22, Ubuntu) | **1** | 141 / 1, PATH-01 B3 only | [U5 run 38356877099](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356877099), job `115161726627` |
| `npm run build` spawned independently inside new build-gate test | **0** | PASS, `R2_BUILD_PROOF command="npm run build" exit=0 signal=null` | Both above CI job logs; `Built static website in dist` asserted |
| `node --test tests/formation-dynamic.test.mjs` individually | **NOT_RUN** | 14/14 constituent cases ran and passed via `npm test` | Both CI jobs |
| `node --test tests/gameplay-allocation.audit.test.mjs` individually | **NOT_RUN** | Existing C3–C8 PASS, B3 FAIL via `npm test` | Both CI jobs |
| `node --test tests/combat.test.mjs` individually | **NOT_RUN** | Existing combat tests all PASS via `npm test` | Both CI jobs |
| Original workflow static build step | **SKIPPED** | `npm test` short-circuit; build executed as standalone child instead | Both CI job-step results |
| Browser U6 smoke | **NOT_RUN** | Workflow skipped Chromium stage following inherited test failure | U6 workflow step results |

**Build-gate design:** An explicit Node child process in new `tests/formation-dynamic.test.mjs` executes the literal command `npm run build`, captures the real exit code, and asserts expected artifact output. This proves build without modifying restricted workflows or hiding the unrelated failing B3. It does not claim the CI workflow's later build/browser steps ran.

**Stability / performance evidence:** 1,000 consecutive `getRallyGoal()` calls on a synthetic 150-soldier, open-map fixture retain exact cache plan/slots/connectivity references; no planning BFS or A* is invoked by unchanged getters. This is a structural assertion, not an invented microbenchmark timing. Other tests check 13- and 17-cell capacity, Standby, cross-layer connectivity, death, preservation on churn, attack/retreat, and pause.

## Follow-ups / risks

- Existing `src/ui/**` may not describe Standby/Unreachable or active-only rallied count well; defer to future UI task; do not edit under this allowlist.
- Synthetic 150 capacity uses an opened synthetic map, *not* a claim that natural underground rooms support 150 troops.
- No benchmark elapsed time claimed; repeated-getter plan object identity is asserted to guard against accidental BFS rebuilds.
- Quality gate for AI-2 source and new tests is satisfied apart from inherited PATH-01 B3; require AI-HEAD review and integration decision, and coordinate B3 with AI-1. AI-HEAD alone may merge.

## AI-HEAD review request

Please verify GitHub PR #30 changed-file allowlist, source and new tests, C4 Red→Green evidence, PATH-01 inherited failure ownership, and integration sequencing with AI-1. Keep this PR Draft until reviewed. No owner decision is required by current delegated authority.
