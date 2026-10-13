# AI-3 — R2-UIFIX-01 Mobile UI Hit-Target Correction

**Date (ICT):** 2026-10-13  
**Status:** CSS hit-target fix implemented, 5/5 real Chromium viewports executed; full-audit gate **FAIL** (46 PASS / 14 FAIL), tracked separately.  
**Task:** https://github.com/tanawutmalirum29-ux/ant-project/issues/32  
**Previous QA report:** https://github.com/tanawutmalirum29-ux/ant-project/issues/25  
**Pinned main/base:** `c108aab1b602a089eca40eb495b8ad4b26d408bf`  
**Work branch:** `work/r2-ai3-ui-hit-targets`  
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/34 — no self-merge  
**CSS source branch SHA:** `a241cb99c1fa146c2c84423ccf454fd9ba081476`  
**Actual PR-merge tested SHA:** `3fa25ba2b05a4eba5a1e49c705df2f4e84eba4fb`  
**Changed paths (exact):** `src/ui/combat.css`, `src/ui/visual/v2-fixes.css`, `src/styles.css`, `docs/ai-reports/AI-3/ROUND_02.md`.  
**Out-of-scope paths modified:** NONE. In particular no JS, gameplay, tests, harness, index or workflow changes.

## Root-cause evidence from the earlier live Chromium run

GitHub Actions original [run 38357247806](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38357247806), [artifact 11793157007](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38357247806/artifacts/11793157007); source main then `f95caf9ec14f2db66381ba99d5429d0e1ae15639`, checkout merge ref `b8f0862720eacc26e07109e9f2ba1328d8b1a1d4`.

- 320×568: `#u6-quick-rally` covered `#forage-plus`; `fail-5.png`.
- 390×844: `#u6-quick-defend` covered `#forage-plus` and `#selection-card` obstructed `#tool-inspect` after room placement; `fail-5.png`, `fail-9.png`.
- 844×390: `#u6-badge` / `#u6-quick-defend` covered `#surface-button` / `#underground-button`, independently reproduced in `browser-v2-live.py` (exit 1); `fail-12.png`.
- These are documented existing failures, not fresh successes. Baseline full workflow failed; legacy `browser-v2-ui-fix.py` and `browser-u6.py` exit 0; `npm test` had 2 existing failures.

## CSS-only implementation

- **Portrait ≤680px and height ≥501px:** `#u6-dock` becomes a right-edge vertical 80px tactical column, its three buttons remain 44px minimum touch height, outside lower work-allocation / tool / layer rows. When Debug opens, move the dock to the left while allowing Debug to occupy a compact 180px right column; the preexisting selection card is suppressed only while Debug is open.
- **Portrait selection:** move `.selection-card:not(.hidden)` from the lower tool row into the upper-left information column at top 207px, at most 190px wide and 130px high with internal scrolling, so room/inspect buttons remain physically clickable. Does not hide selection under ordinary conditions.
- **Short landscape ≤500px:** move the full tactical dock row from `left:35%; bottom:8px` (over layer switch) to horizontal center just above the layer switch (bottom 60px), below the room-option list. Preserve every military command and the existing CSS room picker.
- **320px room palette expanded:** selection card retains visible header and internal scroll, but caps at 86px high above the moved tool row so Inspect remains clickable.
- **Transparent right-side HUD gap:** `.right-controls` wrapper ignores pointer events, its real children remain interactive; this restores map tile hit targets without disabling buttons.
- **Tablet / full desktop:** existing rules untouched except the specifically targeted short landscape breakpoint. Existing interface aesthetics, CSS focus indicators and pointer-events for genuine buttons preserved. `#room-type` and all game logic untouched.

## Actual Chromium QA on PR #34 (2026-10-13, approx. 14:04 ICT)

**Workflow:** https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38360138935 — overall **FAIL** (not a false PASS).  
**Artifact (screenshots + JSONs + stdout + exits):** https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38360138935/artifacts/11793209865 . Contains five `five-viewports/<viewport>/results.json` and available `initial.png`, `selection.png`, `selection-debug.png`, `room-success.png`, `room-invalid.png`, `fail-*.png`, plus `environment.txt` and `exit-codes.txt`. 13.6 MB, GitHub Actions artifact retention as configured.

**Tested CSS branch commit:** `a241cb99c1fa146c2c84423ccf454fd9ba081476`  
**Actual checked-out GitHub PR merge-ref:** `3fa25ba2b05a4eba5a1e49c705df2f4e84eba4fb` (`refs/pull/34/merge`). Do not confuse with latest `main` after other workers' merges. Runner: Linux x86_64, Node `v22.23.3`, Python `3.12.15`, Playwright `1.57.0` with Chromium.

| Viewport | Real case counts | Page errors | Console errors | Disposition |
|---|---:|---:|---:|---|
| 320×568 | **9 PASS / 3 FAIL** | 0 | 0 | Worker, real room SUCCESS and REJECT, tools/Pan/Pinch/Pickers PASS; roster fixture/modal cascade red |
| 390×844 | **12 PASS / 0 FAIL** | 0 | 0 | All real audit cases pass |
| 768×1024 | **8 PASS / 4 FAIL** | 0 | 0 | Recenter expectation, roster fixture, open-modal cascade |
| 844×390 | **9 PASS / 3 FAIL** | 0 | 0 | All originally blocked layer/room targets operable; roster fixture/modal cascade red |
| 1440×900 | **8 PASS / 4 FAIL** | 0 | 0 | Recenter expectation, roster fixture, open-modal cascade |

**TOTAL: 5/5 viewports executed, 46 PASS / 14 FAIL among 60 cases. No Page/Console errors.**

### Recorded exit codes (same Actions artifact)

| Command | Exit | Interpretation |
|---|---:|---|
| `npm test` | **0** | 152/152 tests passed on PR merge checkout (parallel AI-1/AI-2 work had integrated) |
| `npm run build` | **0** | Successful static build (not AWS deployment evidence) |
| Playwright/Chromium install | **0** | Browser provisioned |
| `python -m py_compile tools/browser-phase1-ui-audit.py` | **0** | Harness syntax compiles; not proof of correct assertions |
| `python tools/browser-phase1-ui-audit.py --artifacts <runner>/five-viewports` | **1** | 46 PASS / 14 FAIL across real five viewport JSONs |
| `python tools/browser-v2-ui-fix.py` | **0** | 5/5 viewport smoke checks |
| `python tools/browser-u6.py` | **0** | 5/5 viewport combat checks |
| `python tools/browser-v2-live.py` | **0** | Real room flow 5/5, legacy 844 landscape layer-timeout resolved |
| Combined workflow verdict | **1** | Full audit still red, accurately preserved |

### Fail classification / follow-up gate

- **Original P1 UI collision resolved:** `#forage-plus`, Inspect/Room palette, `#surface-button` and `#underground-button` remain usable alongside three military dock buttons in 320, 390 and 844 test evidence. The transparent `.right-controls` flex region does not swallow legitimate canvas map/room-placement taps. The 320 room queue success and invalid overlap reject now **PASS**. Existing visual colors, CSS room picker `#room-type` source-of-truth, focus states, and map gestures are retained.
- **Army fixture (small/tablet/landscape/desktop):** `assert recruit.count()>0` fails when no eligible recruit is present in the test state. Test aborts while actual modal `#u6-dialog` stays open; subsequent Rally and layout tests encounter correct modal interception. This is a test scenario / cleanup **candidate**, not evidence that the relocated tactical dock blocks map controls. Issue #33 owns harness decisions.
- **Recenter (tablet/desktop):** Test expects entrance world y=434 but observes camera y=512 or 450. Possible viewport camera clamp vs assertion. **UNVERIFIED SUSPECT**: neither genuine gameplay regression nor harness defect conclusively determined; escalate to HEAD/Issue #33 without JS edits.
- **No JS exceptions:** 0 page JS/console errors for all five viewports in actual results. Overall browser audit **FAIL** remains red until HEAD resolves independently.
- **Iteration record:** [run 38358832242](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38358832242) found initial dock map+room-option obstruction; [run 38359340262](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38359340262) confirmed all three legacy scripts green; [run 38359689393](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38359689393) showed 320 selection still blocking Inspect after successful room; **final run 38360138935** fixes that sequence.
- **Review only:** Request AI-HEAD to review this Draft PR and screenshots, then decide merge and independent Issue #33 work. No changes to JS, source gameplay, browser scripts/tests, HTML or workflows. AI-3 has not merged its PR.

---

## Historical previous task — R2-UIQA-01

# AI-3 — Round 02: Five-Viewport Browser QA Report

**Task:** R2-UIQA-01 — Browser QA & UI Defect Triage  
**Status:** BLOCKED — ENVIRONMENT BLOCKER / 0 of 5 viewports executed; browser results NOT RUN (not PASS)  
**Recorded:** 2026-10-13 13:18:30 ICT (UTC+07:00)  
**Issue:** https://github.com/tanawutmalirum29-ux/ant-project/issues/25  
**Historical related Issue:** https://github.com/tanawutmalirum29-ux/ant-project/issues/22  
**Remote main/base SHA (GitHub ref verified):** `1a3e8038e81e5c3cbca1efe67c999c63746169ee`  
**Checkout/tested game SHA:** **NONE** — repository cannot be checked out in this execution environment  
**Work branch:** `work/r2-ai3-browser-qa-blocker-20261013` based on remote main SHA above  
**Report initial commit:** https://github.com/tanawutmalirum29-ux/ant-project/commit/9bfa8ef3463bb160468c723e04fb0256ab9f2b57  
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/28 — documentation-only, not a browser QA PASS  
**Exactly changed file:** `docs/ai-reports/AI-3/ROUND_02.md` (documentation only)  
**Production changes:** NONE  
**Harness modifications:** NONE — no reproducible harness defect has been established

## Runner inventory and evidence

Runner: Debian GNU/Linux 13 (trixie), Linux 6.18.44; Node.js `v22.16.0`; Python `3.13.5`; Chromium `144.0.7559.96`; Python Playwright `1.57.0` (import exit `0`). These are **installed/runtime availability facts**, not proof that the game was launched.

Repository does not exist at `/mnt/data/ant-project/.git` or `/mnt/data/ant-project/tools/browser-phase1-ui-audit.py`. A repository checkout was attempted with this exact command:

```console
$ git ls-remote https://github.com/tanawutmalirum29-ux/ant-project.git refs/heads/main
fatal: unable to access 'https://github.com/tanawutmalirum29-ux/ant-project.git/': Could not resolve host: github.com
[exit code: 128]
```

**Classification:** ENVIRONMENT BLOCKER — outbound GitHub DNS resolution failure on runner. This cannot establish a gameplay, UI, browser-harness or production code defect. GitHub connector APIs could retrieve the remote main SHA and report files, but they do **not** make a local full-game checkout available to Python/Playwright. No second DNS retry has been performed in this report.

## Five required viewports — real runtime evidence

| Viewport | Input type | Executed | Pass | Fail | Skip | Result JSON | Screenshots | JS/console errors |
|---|---|---|---|---|---|---|---|---|
| 320×568 | mobile touch / pinch | NOT RUN | unknown | unknown | unknown | NONE | NONE | UNKNOWN |
| 390×844 | mobile touch / pinch | NOT RUN | unknown | unknown | unknown | NONE | NONE | UNKNOWN |
| 768×1024 | tablet touch / pinch | NOT RUN | unknown | unknown | unknown | NONE | NONE | UNKNOWN |
| 844×390 | short landscape touch / pinch | NOT RUN | unknown | unknown | unknown | NONE | NONE | UNKNOWN |
| 1440×900 | desktop mouse / wheel | NOT RUN | unknown | unknown | unknown | NONE | NONE | UNKNOWN |

**Totals:** 0/5 executed; **PASS 0 confirmed**, FAIL 0 confirmed, SKIP not measured, NOT RUN 5. No `results.json`, runtime screenshots, UI overlap observations, click interception records or browser console traces exist for this run. Zero confirmed FAIL is *not* evidence of zero defects.

## Required commands and real exit status

| Command | Actual exit code | Explanation |
|---|---|---|
| `git ls-remote https://github.com/tanawutmalirum29-ux/ant-project.git refs/heads/main` | **128** | DNS cannot resolve github.com; exact stderr above |
| `python -m py_compile tools/browser-phase1-ui-audit.py` | NOT RUN | no checked-out script |
| `python tools/browser-phase1-ui-audit.py --artifacts /tmp/ant-r2-ui` | NOT RUN | no checked-out game/assets |
| `npm test` | NOT RUN | no checked-out package/project |
| `npm run build` | NOT RUN | no checked-out package/project |
| `python tools/browser-v2-ui-fix.py` | NOT RUN | no checked-out script/game |
| `python tools/browser-u6.py` | NOT RUN | no checked-out script/game |
| `python tools/browser-v2-live.py` | NOT RUN | no checked-out script/game |

Existing PATH-01/FORM-01 or old B3/C4 failure references are **historical known findings**, not retested, cleared or regressed by this execution. Source availability through GitHub API and installed Chromium/Playwright do not satisfy five-viewport acceptance.

## UI/gameplay scope not verified

No assertions about HUD clipping, CSS room-picker / authoritative `#room-type`, digging/rooms (valid queue or reject), page zoom guard, map gestures, recruit/defend/rally/retreat, selection/debug/tactical dock, or runtime JavaScript exceptions can be made. No new UI defect Issue is warranted without actual browser reproduction/screenshot. No production fix, test-harness edit or CI config change was made.

**R3 verification priorities (hypotheses only, not confirmed bugs):** selection/debug/tactical-dock overlap and hit targets in short landscape; successful versus rejected room placement feedback and `#room-type` cost synchronization; rally status and ability feedback after AI-2's formation integration.

## Blocker escalation to AI-HEAD

**Decision needed:** Provide or authorize an actual repository checkout on a GitHub Codespace / GitHub Actions runner with working network and Playwright Chromium; alternatively supply a complete source archive as a runner input. Do not modify production or workflow files under this task's allowlist.

**Next action on a checkout-capable runner:** verify `git rev-parse HEAD` and versions; execute the exact py_compile, five-viewport script, npm tests/build and three legacy scripts, preserving exit codes and preexisting red tests. Export screenshots, five per-viewport result JSONs, console/page errors and logs as linked artifacts outside the repository. File an individual defect Issue only for runtime-reproduced defects, then report to AI-HEAD. This run stops at its evidenced blocker rather than inventing PASS results.
