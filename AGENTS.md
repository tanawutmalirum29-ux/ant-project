# Ant Kingdom — AI contributor rules

READ THIS BEFORE CHANGING CODE. Source of truth: WORK_BOARD.md, docs/U5_GAMEPLAY_BRIEF.md, docs/V2_UIUX_GRAPHICS_BRIEF.md and docs/INTEGRATION_QA.md. Main has completed U1–U4 and V1.

## Select exactly one workstream per branch
- **Gameplay (owner: AI-A):** U5 rooms/economy, later U6–U8. Branch feature/u5-rooms-economy. Code owner controls game state, simulation, navigation, gameplay integration and production wiring.
- **Visual (owner: AI-B):** V2 UI/UX, sprites, icons, asset previews. Branch visual/v2-art-ui. Do not change gameplay or production wiring.
- **Coordination (this docs change):** Keep workstream contracts in main; modify them only via reviewed PR.

## Non-negotiable rules
1. Always fetch current main and read this file + relevant brief before starting. Branch from current main. Never force push, overwrite another branch, or directly commit feature work to main.
2. Only edit allowlisted files for your chosen workstream. If a defect is outside scope, document reproduction steps, affected path, expected/actual behavior, and severity; DO NOT fix it. If the defect blocks your work, stop that portion and report it.
3. Visual work MUST NOT modify: index.html, src/main.js, src/ui/app.js, src/styles.css, src/render/renderer.js, src/render/camera.js, src/core/**, src/world/**, tools/build.mjs, amplify.yml, package.json or existing tests. No DOM ID changes, event-handler replacements, monkey-patching, or global runtime hooks.
4. Gameplay work owns integration to live game and may change production shared files as needed for U5 only, while respecting U1–U4 and V1. Visual work stays isolated until a separately reviewed integration step.
5. UI-B may create src/ui/visual/v2.css, src/render/visual/**, assets/ui/**, assets/sprites/**, design/v2/**, docs/V2_ACCEPTANCE.md, tests/v2-visual.test.mjs, tools/browser-v2.py. New files only in these paths; do not edit V1 CSS.
6. UI-B must ship a standalone preview in design/v2/ that imports v2.css and demonstrates visual assets without modifying the production page. V2 is NOT considered deployed to the live game until the owner deliberately integrates it.
7. Run npm test and npm run build, and re-run meaningful U1–U4 browser regressions where available. Attach viewport evidence and be precise about what was actually tested. Never claim deployed/mobile-device verification without doing it.
8. Before PR, compare changed file paths against the ownership table. If any forbidden file changed, revert only your own change to it; never discard somebody else's work.
9. Open PR targeting main. Report scope, changed files, screenshot locations, test commands/results, blockers and discovered out-of-scope bugs. No auto-merge. Integration owner reviews and orders merges.
10. If main advances while branch is open: fetch/rebase or merge main WITHOUT force-pushing over collaborators, rerun tests, inspect diff again. Changes to shared contracts require a new coordinated PR.

## Acceptance
- No JS errors or lost pre-existing controls, map interactions, resources, brood, digging or foraging.
- Visual preview remains optional; no imports into production without explicit integration.
- Gameplay resource conservation and simulation invariants remain covered by tests.
- An issue or bug report is NOT permission to edit outside ownership.

## Quick links
- WORK_BOARD.md: current assignments and file ownership
- docs/V2_UIUX_GRAPHICS_BRIEF.md: copy/paste instructions for AI-B
- docs/U5_GAMEPLAY_BRIEF.md: AI-A U5 implementation contract
- docs/INTEGRATION_QA.md: PR, conflicts and acceptance checklist
