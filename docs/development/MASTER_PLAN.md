# New Development Master Plan — Ant Kingdom
Baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237 | Draft awaiting owner approval; existing rounds remain closed, GAME DEVELOPMENT REMAINS ACTIVE.

## Decision policy
Stabilize real gameplay and validate evidence before features or aesthetics. This is a new scope, NOT reopening the old U-series phases. Phase 0 edits documentation only. Source/QA risks are hypothesis tickets until reproduced. Priority P0=playability/ledger corruption, P1=reliability, P2=efficiency/UX, P3=optional features.

## Phase 0 — audit and owner review (NOW)
PH0-HEAD-01: source-tree system audit and evidence matrix; owner AI-HEAD; no gameplay code edits. Acceptance: fixed main SHA, five-state classification, source links, test limitations.
PH0-HEAD-02: ownership, contracts, work board, QA protocol, AI briefs in a documentation-only Draft PR; owner AI-HEAD. Acceptance: no main modifications, no code/test/tool changes, owner can review plan.
PH0-HEAD-03: obtain owner decision for Wave 1 test-only PRs. Approval gate: explicit "Approve Wave 1" or task-specific authorization.

## Phase 1A — evidence first (proposed, may run parallel AFTER approval)
P1-ECO-01 [AI-1, P0]: create conservation/role-transition regression tests, not a mechanic change. Tests: cargo death; room build death; cancel while builder moves; disconnected storage; simultaneous shortage; multi-tick invariant per resource type. Pass: runnable test with explicit initial inventory+source+injected = sources + cargo + room stock + held + spent + consumed + lost; no silent expected-value changes.
P1-AI-01 [AI-2, P0]: create worker/state/rally transition tests, no mechanic change. Tests: count and eligibility before/after recruits, worker death, new birth; switch duties with active tasks; 2/13/14 defenders; multi-layer rally, blocked tile, pause. Pass: no dual-owned task, no off-grid move, no unclaimed orders; classify failures with repro.
P1-UI-01 [AI-3, P1]: create/add browser-only observability checks, no CSS/gameplay change. Tests: 5 viewports, 5 input/control flows, dock/selection/debug overlap, room picker, zoom, touches, JS errors and UI↔game snapshots. Pass: screenshots and run logs for every viewport, no click interception and known limitations recorded.
Dependencies: all require PH0 owner approval and approved integration contract. PRs can be coded concurrently in UNIQUE NEW test paths and reviewed separately.

## Phase 1B — confirmed fixes only (proposed; gated by Phase 1A evidence)
P1-ECO-02 [AI-1, P0 if failure confirmed]: correct only proven resource/reservation/room death or shortage issue; exact files require HEAD authorization and add relevant regressions. Depend P1-ECO-01.
P1-AI-02 [AI-2, P0 if failure confirmed]: correct only proven ant role/queued task/rally motion issue; exact files require HEAD authorization. Depend P1-AI-01; special approval for lifecycle/foraging edits.
P1-UI-02 [AI-3, P1 if failure confirmed]: correct only proven layout/touch/zoom/selection defect in visual/UI modules; exact files require HEAD authorization. Depend P1-UI-01.
P1-HEAD-INT [HEAD, P0]: after each PR check allowlist, regression + merged state + dependencies, collect owner approval before merging core gameplay changes.
Any P1 issue without reproducible evidence is postponed, not patched by conjecture.

## Phase 2 — benchmark-driven stability
P2-PERF-01 [HEAD research; owner TBD, P1]: profile steady tick, room connectivity, A*, combat goal search and render at 5/50/100/150 ants, 1/8/16/32 rooms, 100/600 dig tasks. Fixed seed, machine and browser. Target: no unbounded growth, at x1 median sim tick < 50ms and p95 < 100ms on agreed reference machine; target may be revised after baseline measurement. No optimization without profile.
P2-QA-01 [HEAD, P1]: propose unified always-on PR gate and main protection for owner approval, with CPU-conscious browser smoke. No CI/workflow changes until specifically approved.

## Phase 3 — gameplay proposals, NOT ASSIGNED
P3-GAME-01: decide whether finite resources need replenishment/survival loop; define balance and conservation model before changes.
P3-GAME-02: only if player benefit proven, consider independent squads, durable saves, or better ant traffic; architecture decision record first. No coding while unresolved.

## Critical merge order
1. PH0 docs Draft PR reviewed; approve plan.
2. P1 test-only PRs (each independent file, merge ONE PR at a time, rerun all tests).
3. Promote confirmed failures to actionable fix tickets; freeze exact file ownership before starting P1B.
4. Changes to game.js, main.js, index.html, package.json, tools/build.mjs, or workflows are HEAD-only Integration PRs with explicit owner approval.
5. Recheck main SHA before each merge. If base changed, rebase branch (non-force where possible), run all gates again. Never merge two PRs simultaneously.
6. Future phases are re-planned based on passed evidence, not calendar promises.

## Stop conditions
Any unexplained ledger mismatch, teleport, lost queue ownership, inability to pause, regression, failed build, failing required browser view, missing reproducible logs, or changed files outside allowlist blocks merge (Needs Rework). CI ≠ AWS approval ≠ real device approval.
