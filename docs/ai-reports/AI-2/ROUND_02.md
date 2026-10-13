# AI-2 — Round 02 / R2-COMBAT-01: Dynamic Formation C

**Date:** 2026-10-13 (Asia/Bangkok, UTC+7)
**Task:** R2-COMBAT-01 / FORM-01
**Issue:** https://github.com/tanawutmalirum29-ux/ant-project/issues/24
**Authorization:** AI-HEAD Issue comments `6139289025` and `6139435346` — APPROVED, earlier owner gate superseded.
**Verified main base:** `1a3e8038e81e5c3cbca1efe67c999c63746169ee`
**Branch:** `work/r2-ai2-dynamic-formation`
**Draft PR:** Pending creation at this report revision.
**Current last code commit:** `64441435e662b43724848e93bbe714052afdbdf0`

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

## Tests / verification matrix

New tests cover: synthetic soldier counts 0/1/2/13/14/50/150, legacy preferences, 13/17-tile corridors with real standby, disconnected origin, paired portal, physically disconnected cross-layer start, recruit/demobilize/death, same/new/invalid rally, active-only arrival, threat and injury retreat, deterministic event replay, >=1000 repeated cache reads, and paused Game.

| Command / evidence | Exit | Actual status |
|---|---|---|
| `git ls-remote https://github.com/tanawutmalirum29-ux/ant-project.git HEAD` | **128** | BLOCKED: local container DNS cannot resolve `github.com` |
| `node --test tests/formation-dynamic.test.mjs` | NOT_RUN | Checkout unavailable locally; pending remote CI evidence |
| `node --test tests/gameplay-allocation.audit.test.mjs` | NOT_RUN | Pending remote CI |
| `node --test tests/combat.test.mjs` | NOT_RUN | Pending remote CI |
| `npm test` | NOT_RUN | Pending remote CI |
| `npm run build` | NOT_RUN | Pending remote CI |
| Browser U6 smoke | NOT_RUN | Pending remote CI |

**Important:** Source code and test files have been committed, but no PASS is claimed without an actual process exit or GitHub CI job log. FORM-01 original C4 and unrelated PATH-01 B3 are yet to be verified on this branch.

## Follow-ups / risks

- Existing `src/ui/**` may not describe Standby/Unreachable or active-only rallied count well; defer to future UI task; do not edit under this allowlist.
- Synthetic 150 capacity uses an opened synthetic map, *not* a claim that natural underground rooms support 150 troops.
- No actual benchmark elapsed time claimed; repeated-getter plan object identity is asserted to guard against accidental BFS rebuilds.
- Await Draft PR CI, collect test failures (including inherited B3), update this report and Issue with real results; AI-HEAD alone may merge.
