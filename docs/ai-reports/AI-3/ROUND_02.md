# AI-3 — R2-UIQA-HARNESS-01 Browser QA Harness Correction

**Task:** https://github.com/tanawutmalirum29-ux/ant-project/issues/33  
**Date (ICT):** 2026-10-13  
**Status:** IMPLEMENTED — awaiting actual GitHub Actions browser validation (do not assume PASS)  
**Original current-main base:** `fee90a9d35cf742d452c2c01ecef14397fb52e21`  
**Branch:** `work/r2-ai3-browser-harness-correction` (new, old #34 branch untouched)  
**Change paths only:** `tools/browser-phase1-ui-audit.py`, `docs/ai-reports/AI-3/ROUND_02.md`  
**Harness initial implementation commit:** `4959d86ebd8051ace2813c0c960ef2fdb0026de5`  
**Draft PR:** to be linked after creation

## Technical correction summary (source-only until runner returns)

1. **Recenter** — Preserve zoom-in, zoom-out, genuine canvas pan and Recenter click assertions. Compare observed camera center to independently calculated `Camera.clamp` bounds: half canvas dimensions divided by real zoom, real map width/height × 28 and actual entrance coordinates. Assert 1 world-pixel tolerance for both axes; never change camera state during this check.
2. **Real combat roster** — If a naturally eligible recruit exists, test recruit then demobilize using visible controls. If all workers are busy, inspect real eligibility read-only, demobilize an actual existing soldier through the roster UI and re-enlist that same worker; assert soldier count transitions and correct identifier. Do not fabricate ants or mutate game internals.
3. **Modal isolation** — Enclose combat test in `try/finally`. Verify a genuine `showModal()` dialog is open, and close with the real close button even if roster test fails. Assert modal is truly closed; no force-clicks.
4. **Source SHA truth** — Replace hardcoded old `main_sha` with `subprocess.run(['git','rev-parse','HEAD'])` on the runner, `tested_sha`/GitHub `GITHUB_REF` and `checkout_kind=pr_merge` for synthetic PR refs. Outside a checkout report `null` instead of inventing main. All 12 cases × 5 viewports retained, all original input/room/layout/JS assertions retained.

## Requested CI and acceptance evidence

R2 Five Real Viewports workflow must produce 5 separate `results.json`, true screenshot artifacts, and `exit-codes.txt` with `npm test`, `npm run build`, `py_compile`, full UI audit and 3 independent browser scripts. Do not declare completion until 60/60 true PASS on one PR-tested checkout. Existing 55/60 run: https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38362234085 . No production files edited or main merged.

---

## Prior AI-3 Round 2 work (historical and unchanged)

# AI-3 — R2-UIFIX-01 Mobile UI Hit-Target Correction

**Date (ICT):** 2026-10-13  
**Status:** CSS hit-target correction verified on five real Chromium viewports, **55 PASS / 5 FAIL** comprehensive audit. Three independent UI/Combat CI workflows SUCCESS. Five remaining audit cases disclosed.  
**Task:** https://github.com/tanawutmalirum29-ux/ant-project/issues/32  
**Previous QA report:** https://github.com/tanawutmalirum29-ux/ant-project/issues/25  
**Pinned main/base:** `c108aab1b602a089eca40eb495b8ad4b26d408bf`  
**Work branch:** `work/r2-ai3-ui-hit-targets`  
**Draft PR:** https://github.com/tanawutmalirum29-ux/ant-project/pull/34 — no self-merge  
**Latest tested CSS source SHA:** `c639f421a7347e81dc04dcf43f5aa76f4d356f28`  
**Actual latest tested PR-merge SHA:** `f6cf95a5f71c42a8345ca833125ca4baccbf2dba`  
**Changed paths (exact):** `src/ui/combat.css`, `src/ui/visual/v2-fixes.css`, `src/styles.css`, `docs/ai-reports/AI-3/ROUND_02.md`.  
**Out-of-scope paths modified:** NONE. In particular no JS, gameplay, tests, harness, index or workflow changes.

## Final UI CSS verification — latest tested implementation (2026-10-13, ICT)

**Work code SHA:** `c639f421a7347e81dc04dcf43f5aa76f4d356f28`; **actual tested PR merge-ref SHA:** `f6cf95a5f71c42a8345ca833125ca4baccbf2dba`. The PR was created from `main@c108aab1b602a089eca40eb495b8ad4b26d408bf`; test merge-ref includes concurrent main changes. The later report-only commit is not a new CSS implementation.

**Five-viewport Actions run:** https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38361647332 — overall FAIL because full-audit has five remaining red cases. **Downloadable screenshots, five `results.json`, versions and exact exit logs:** https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38361647332/artifacts/11794798436 .

| Viewport | PASS | FAIL | Page / console errors |
|---|---:|---:|---:|
| 320×568 | 12 | 0 | 0 / 0 |
| 390×844 | 12 | 0 | 0 / 0 |
| 768×1024 | 11 | 1 | 0 / 0 |
| 844×390 | 12 | 0 | 0 / 0 |
| 1440×900 | 8 | 4 | 0 / 0 |
| **Total, 5/5 executed** | **55** | **5** | **0 / 0** |

**Real command exits (run 38361647332):** `npm_test=0` (152/152 tests), `npm_build=0`, `playwright_install=0`, `py_compile=0`, `ui_5_viewports=1` (55 PASS / 5 FAIL), `browser_v2_ui_fix=0`, `browser_u6=0`, `browser_v2_live=0`. The comprehensive gate is **red**, not PASS.

**Independent PR workflows on the same CSS commit:** [V1 Visual Integrity](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38361647281) **SUCCESS**, [V2.1 UI interaction regression](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38361647475) **SUCCESS**, [U6 Combat and Regression](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38361647339) **SUCCESS**. Legacy V1 had independently reproduced a tablet 768px `#nurse-plus` interception by `#u6-quick-defend`; a tightly scoped `combat.css` medium-tall tablet breakpoint repositions dock above the left allocation lane and V1 now passes. 320/390 portrait and 844 short landscape originally blocked controls pass all 12 comprehensive cases. All three military buttons remain real touch targets and `#room-type` unchanged.

**Remaining red tests — not hidden / not patched outside allowlist:** tablet `#recenter` test expected camera world y434 but observed y512; desktop expected y434 but observed y450 (**UNVERIFIED SUSPECT**, possibly viewport clamp). Desktop military scenario has no recruitable worker although the test asserts a positive recruit count; on failure its modal remains open, leading to downstream Rally and layout interception reports. This may be fixture/test cleanup, **not independently proven** game or harness fault. Refer to [Issue #33](https://github.com/tanawutmalirum29-ux/ant-project/issues/33) for AI-HEAD-directed triage and do not edit JS/harness here.

**Exact branch allowlist:** `src/ui/combat.css`, `src/ui/visual/v2-fixes.css`, `src/styles.css`, `docs/ai-reports/AI-3/ROUND_02.md`; no out-of-scope paths. No worker merge. **Request AI-HEAD review of Draft PR #34**, with full-audit FAIL disclosed rather than concealed.

---

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
- **Tablet width 681–849px, height ≥501px:** the whole tactical dock moves to the upper-center band to avoid the V1 economic/nurse control lane; medium tablet V1 regression now passes. Full desktop layout otherwise unchanged. Existing interface aesthetics, CSS focus indicators and pointer-events for genuine buttons preserved. `#room-type` and all game logic untouched.

## Earlier PR #34 QA iteration (superseded by latest verification above)

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
