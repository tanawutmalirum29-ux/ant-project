# AI-1 — Round 02: Miner Path Guard (R2-SIM-01)

**Status:** SOURCE FIX COMPLETE; PATH-01 GREEN IN GITHUB ACTIONS; DRAFT PR — AWAITING AI-HEAD REVIEW; overall CI RED solely due unrelated FORM-01.

- Date / checkpoint (Asia/Bangkok, UTC+7): **2026-10-13 13:23**
- Issue: https://github.com/tanawutmalirum29-ux/ant-project/issues/23
- Synthetic PATH-01 tracking: https://github.com/tanawutmalirum29-ux/ant-project/issues/20
- Related FORM-01 tracking: https://github.com/tanawutmalirum29-ux/ant-project/issues/21
- Fresh verified `main` base: `1a3e8038e81e5c3cbca1efe67c999c63746169ee` (not the obsolete `615fac2` baseline).
- Branch: `work/r2-ai1-colony-path-guard`
- Draft PR: https://github.com/tanawutmalirum29-ux/ant-project/pull/29
- RED commit (tests only): `145df5aa72ac3fc930b30b9fb4b90c15bb97a89d`
- GREEN production fix commit: `45809595106a5eced836f76442119f7a2294c4b6`
- Latest source/test verification head: `1e83fc9f056254e3f628f19c394dc97b8907dd72` (report commit follows this verified tree).
- Latest branch URL, including report commit: https://github.com/tanawutmalirum29-ux/ant-project/tree/work/r2-ai1-colony-path-guard

## Exact diff / scope

Allowed modified paths (GitHub compare against base):
```text
M src/core/colony.js
A tests/colony-path-guard.test.mjs
M docs/ai-reports/AI-1/ROUND_02.md
```
No changes to any existing test, `src/core/combat.js`, unrelated source, workflow, documentation, or `main`. Original `tests/gameplay-allocation.audit.test.mjs` remains byte-for-byte unchanged (baseline blob SHA `46016ab835c885980e9522944e5a889dd9f2894d`).

## Implemented

1. Added `abandonOrder(ant,job)` to return a dig job to `queued` **only if** `job.workerId === ant.id`. Clear stale worker movement state by the existing `release` method; never erase a foreign worker's reservation.
2. At every in-flight tick, before consuming another 0.34 motion increment or committing x/y, validate that the pending `ant.next` tile remains walkable, cardinally adjacent, and identical to the head of `ant.path`; validate current tile remains walkable too. On failure: do not move, clear path/next/motion and safely requeue the owned job.
3. When dig target changes to non-diggable, release the job owner consistently; retain queued order ID/progress rather than silently deleting or reassigning a different order. Reopened terrain can subsequently resume digging via existing `chooseOrder`.
4. Preserve original `WORKER_SPEED = 0.34`, valid routing, dig ticks, resource accounting, and no teleport semantics.
5. New focused test cases `PATH-GUARD-01` through `10`: two seeded synthetic in-flight obstructions, partial-motion obstruction, non-cardinal hop, pending path mismatch, invalid target cleanup, stale foreign job reference, reopening/requeue/recovery, concurrent two-miner ownership and no teleport, exact movement speed, and pause integrity.

**Important scope limitation:** All forced `writeCell` terrain closures are expressly **synthetic** fault-injection tests. No ordinary user-triggered terrain closure was established in this task.

## Actual command / exit evidence

| Phase / runner | Command | Exit code | PASS | FAIL | Evidence |
|---|---|---:|---:|---:|---|
| RED test-only branch `145df5a`, GitHub U6 | `npm test` | **1** | **130** | **8** | https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356155396 |
| GREEN fix `4580959`, GitHub U6 | `npm test` | **1** | **137** | **1** | https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356246448 |
| Final code/tests `1e83fc9`, GitHub U6 | `npm test` | **1** | **137** | **1** | https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356403152 |
| Final code/tests `1e83fc9`, GitHub U5 | `npm test` | **1** | **137** | **1** | https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38356403155 |
| Local checkout attempt | `git clone --depth 1 --branch main https://github.com/tanawutmalirum29-ux/ant-project.git /mnt/data/ant-project-r2ai1` | **128** | — | — | `Could not resolve host: github.com` (container DNS failure) |
| Local standalone | `node --test tests/colony-path-guard.test.mjs` | **NOT_RUN** | — | — | Checkout unavailable |
| Local standalone | `node --test tests/gameplay-allocation.audit.test.mjs` | **NOT_RUN** | — | — | Checkout unavailable |
| Local standalone | `node --test tests/economy-accounting.audit.test.mjs` | **NOT_RUN** | — | — | Checkout unavailable |
| Local / CI | `npm run build` | **NOT_RUN / SKIPPED** | — | — | Checkout unavailable locally; CI workflows halt after known C4 test failure |
| Browser / UI smoke | browser scripts | **NOT_RUN / SKIPPED** | — | — | CI steps depend on successful `npm test` |

On the final U5/U6 actual `npm test` runs (**138 tests total**), all **10/10 new PATH-GUARD tests PASS**, original **B3 PATH-01 PASS**, all **12/12 ECO-01..12 PASS**, and original **C4 FORM-01 FAILS** (`13 !== 14` duplicate formation goal). No other failure observed. Red→green delta: six new failures and B3 fixed; C4 unchanged.

`npm test` **must not be called PASS** because its real exit code is 1. `npm run build` **must not be called PASS** because it has not executed on the candidate. Existing CI step-level conclusions explicitly report static build SKIPPED.

## Risks / blockers / HEAD review

- **Unresolved unrelated known failure:** FORM-01 C4 (#21), owned by AI-2; no changes permitted here.
- **Runtime blocker:** local git clone cannot resolve GitHub DNS; prevents independent standalone test commands and standalone build exit-code capture.
- **Quality gate satisfied for source-scoped PATH-01:** existing unchanged B3 changed RED→GREEN; focused 10/10 and ECO 12/12 green within actual CI npm test; same valid speed and no double owner in regression.
- **Quality gate NOT fully satisfied for all-command execution:** independent `npm run build` and browser runtime not executed.
- **Decision requested from AI-HEAD:** review code/changed-file allowlist and source-scoped PATH-01 evidence, arrange or require independent `npm run build` before final merge; coordinate FORM-01 separately with AI-2. Do **not** merge until HEAD decides.
- Next step: AI-HEAD performs review; AI-1 remains on Draft PR and does not push to main or merge.
