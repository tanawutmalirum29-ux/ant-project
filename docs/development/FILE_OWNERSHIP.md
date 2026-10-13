# File Ownership — strict allowlists

> **HISTORICAL EXACT-FILE GRANTS — CLOSED 2026-10-13.** These Phase 0/Wave 1 allowlists are retained for audit traceability only and do not grant permission for new edits. The project is active, with fresh file ownership and AI task distribution to be specified in the next owner-approved development wave. No AI should begin or merge new production changes based on this document alone.

Baseline d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237; phase-specific, not permanent ownership. Files absent in an allowlist are READ-ONLY, even if an AI "normally owns" that folder. No wildcard grant by expertise. Never modify a competing AI's files, shared entry points, or global tooling without written HEAD approval for a new task.

## Phase 0 — documentation-only HEAD branch
HEAD may create ONLY docs/development/{SYSTEM_AUDIT,MASTER_PLAN,WORK_BOARD,FILE_OWNERSHIP,INTEGRATION_CONTRACTS,QA_PROTOCOL,AI_BRIEFS}.md. No other writes. AI-1/2/3 do not write until Wave 1 authorization.

## Wave 1: individual exact-file grants (PROPOSED, NOT YET AUTHORIZED)
- AI-1 / P1-ECO-01: CREATE tests/economy-accounting.audit.test.mjs ONLY. No edits to existing tests, core, world, UI, config.
- AI-2 / P1-AI-01: CREATE tests/gameplay-allocation.audit.test.mjs ONLY. No edits to existing tests, core, world, UI, config.
- AI-3 / P1-UI-01: CREATE tools/browser-phase1-ui-audit.py ONLY. No edits to existing browser harnesses, index.html, CSS or JS. Capture screenshots to ignored/untracked local output, DO NOT commit binaries/artifacts.
- HEAD / P1-HEAD-INT: integration review only; source changes solely via a new, authorized integration-specific PR.

## Conditional Wave 1B: reserved candidates, NOT permissions
- AI-1 potential code areas: src/core/foraging.js, src/core/rooms.js, src/core/lifecycle.js. HEAD must issue exact file set after repro and verify AI-2 has no overlapping needs.
- AI-2 potential code areas: src/core/colony.js, src/core/combat.js, src/world/navigation.js (and, only by separate approval, other src/world modules). src/core/lifecycle.js is AI-1 candidate: do not edit; request a handoff.
- AI-3 potential code areas: src/ui/app.js, src/ui/combat-controls.js, src/ui/combat.css, src/ui/visual/room-picker.js, src/ui/visual/page-zoom-guard.js, src/ui/visual/v1.css, src/ui/visual/v2.css, src/ui/visual/v2-fixes.css, src/styles.css, src/render/camera.js, src/render/renderer.js, assets/ and design/; all explicitly FORBIDDEN until a selected task grants exact paths.

## HEAD-controlled files (DENY to contributors unless new written grant)
src/core/game.js, src/main.js, index.html, package.json, tools/build.mjs, tools/dev-server.mjs, amplify.yml, .github/workflows/**, README.md, docs/GAME_SYSTEMS.md, docs/AMPLIFY_DEPLOY.md, docs/development/**. Tests not explicitly granted are also denied. This prevents integration drift. HEAD should request owner approval before changing high-impact files.

## Merge/process policy
1. AI sends main SHA and proposed changed-file list. HEAD validates against allowlist before authorizing code.
2. Create branch from the pinned main SHA: work/simulation-P1-ECO-01, work/gameplay-P1-AI-01 or work/visual-P1-UI-01. Contributors cannot push to main.
3. Change only assigned exact paths; execute git diff --name-only <baseSHA>...HEAD and report all files.
4. If a shared change is necessary, STOP, open an escalation request with precise path/reason/contracts/tests. HEAD schedules a sequential handoff or integration PR; never edit first and apologize later.
5. Before merging each PR, HEAD checks base SHA, all diffs, CI and regression. Integration failures go back as Needs Rework.
