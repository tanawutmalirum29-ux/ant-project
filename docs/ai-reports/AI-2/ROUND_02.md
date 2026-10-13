# AI-2 — Round 02: Dynamic Formation Report

**Status:** ASSIGNED / WAITING FOR CONTRACT FREEZE (scaffold from outgoing HEAD, not an actual implementation)
**Task:** R2-COMBAT-01 / FORM-01
**Live GitHub report Issue:** https://github.com/tanawutmalirum29-ux/ant-project/issues/24
**Prior design and addendum review:** https://github.com/tanawutmalirum29-ux/ant-project/issues/21
**Starting main:** `615fac2b8cbffbc498f98c9aef0b13b03ec9a750`
**Proposed feature branch:** `work/r2-ai2-dynamic-formation`

**Exact files permitted after successor HEAD's written contract freeze:** `src/core/combat.js`, new `tests/formation-dynamic.test.mjs`, this report file. All other paths READ-ONLY. No main push/merge.

## Stage 0 — REQUIRED before coding

Post proposed final interface/behavior contract to Issue #24 and await explicit new HEAD decision; public `ralliedCount` change also needs owner's acceptance where required. Technical design alone did not authorize implementation. Proposed Hybrid Chebyshev radius 8 AND 4-direction shortest path <=12; unique, reachable target slots, first-13 offset preference, preserve-valid-goal, Standby and Unreachable with nullable `getRallyGoal()`, true Arrived tally during active Rally, real cross-layer portal, dirty/cache on roster/rally/world/ordinary completed digs only; no general terrain mutation or collision avoidance. Preserve threat/HP/retreat and same-target `setRally` motion reset.

## Agent progress — update on your branch after Stage 0

- Last update (Asia/Bangkok): NOT STARTED
- Current branch HEAD SHA / Draft PR: NONE
- Changed-file list: NONE
- Completed implementation: NONE
- Technical decisions pending from new HEAD: all Stage-0 contract items above

## Actual tests

| Command / Case | Exit code | PASS | FAIL | Status |
|---|---|---|---|---|
| FORM-01 / C4 baseline | NOT RUN | — | — | Pending |
| New 0/1/2/13/14/50/150 formation suite | NOT RUN | — | — | Not created |
| `npm test` | NOT RUN | — | — | Pending |
| `npm run build` | NOT RUN | — | — | Pending |

## Evidence / risks / next decision

- Logs, CI URLs, artifacts: NONE
- Known unrelated red: PATH-01, Issue #20
- Blocker: CONTRACT FREEZE BEFORE SOURCE CHANGE
- Requested decision: new HEAD contract signoff in Issue #24, and owner signoff if changing public gameplay behavior
- Next step: submit short contract acknowledgment and explicit request via Issue #24; record decisions and later test results in this file
