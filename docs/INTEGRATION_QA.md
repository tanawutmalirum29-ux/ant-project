# Parallel Integration & Quality Protocol

## Git workflow
1. Fetch latest main and read AGENTS.md, WORK_BOARD.md and workstream brief.
2. Create exactly one feature branch for the assigned scope: feature/u5-rooms-economy OR visual/v2-art-ui.
3. Keep commits scoped; do not update somebody else's branch, force-push, or write directly to main.
4. Before PR, inspect git diff --name-only main...HEAD and check the ownership allowlist. Also inspect diff for accidental behavior changes.
5. Run npm test and npm run build locally. Run actual Chromium smoke/preview where tooling is available, recording versions and viewports.
6. Create PR targeting main with scope, evidence, test commands/output, altered paths, issue reports and integration blockers. Leave open for review.
7. After main changes, synchronize the branch and rerun checks. The integration owner decides merge order.

## Proposed merge sequence
- Merge documentation first (this coordination pack).
- AI-A U5 PR and AI-B V2 PR can be developed simultaneously without editing the same production files.
- V2 new files may be merged independently, but v2.css remains unlinked/inactive.
- Once U5 passes and merges, owner can open integration/u5-v2 to add stylesheet link in index.html and optional asset drawing adapters in renderer. Order is styles.css, v1.css, v2.css.
- Run full U1–U5 suite + V2 previews against combined code BEFORE merging integration PR.
- If an asset is not yet wired to the renderer, explicitly mark it as preview-only instead of calling it implemented.

## Repeatable QA matrix

| Area | Test |
| --- | --- |
| Baseline U1 | Seed determinism, clock pause x1 x2 x4, world layer persistence, mobile zoom/pan |
| Baseline U2 | Dig orders, cancel, blocked soil, unreachable paths, no worker freeze |
| Baseline U3 | Source reservation, delivery across two layers, no stock creation |
| Baseline U4 | Queen eggs, brood stages, nursing, hunger, death and resource conservation |
| U5 | Construction worker travel, overlap, connectivity, disabled unfinished room, capacity full, cancellation |
| V1/V2 | 320x568, 390x844, 768x1024, 844x390, 1440x900: no clipping/overflow/control overlap |
| Rendering | No uncaught console exceptions, no missing textures, no input-blocking overlays |
| Packaging | npm test, npm run build, verify dist/index.html, runtime JS and visual assets |
| Live | AWS Amplify and actual smartphone: separately verify; not implied by local smoke tests |

## Bug report format
**Severity:** blocker/high/medium/low
**Location:** module/path, screen, world seed, viewport
**Repro:** numbered exact actions and relevant game tick
**Expected / Actual:** values and screenshots/log
**Owner:** gameplay / visual / integration / unknown
**Change made:** None if outside assigned ownership
**Retest:** outcome after the responsible owner resolves it

Never silently alter out-of-scope files to eliminate a symptom. An observed bug is a report, not a license to change another contributor's code.

## Pull request checklist
- [ ] Diff paths satisfy allowlist for that branch
- [ ] No changes to unrelated engine/UI behavior
- [ ] U1–U4 regressions rerun; U5/V2 specific tests as relevant
- [ ] npm run build passes and expected files are included
- [ ] Browser interaction / preview screens captured where possible
- [ ] No new console errors; no undisclosed blocked/missing checks
- [ ] Known issues clearly documented, with reproduction steps
- [ ] No direct main changes or force pushes
