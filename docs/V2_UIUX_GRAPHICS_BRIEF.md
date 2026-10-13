# V2 — UI/UX & Graphics Work Order (AI-B)

## Copy/paste task for the other AI

You are **AI-B, the visual-only owner** for Ant Kingdom at https://github.com/tanawutmalirum29-ux/ant-project . Read AGENTS.md, WORK_BOARD.md and docs/INTEGRATION_QA.md on latest main before any edits. V1 compact HUD and U1–U4 gameplay already exist. Work in a NEW branch named visual/v2-art-ui from latest main. Do not edit or commit directly on main.

Your assignment: build a polished, cohesive **original 2D ant-colony UI/UX and graphics pack** which can be integrated safely while AI-A independently implements U5 Rooms & Economy. The live game currently renders via Canvas and HTML/CSS. Your changes must be independently previewable and MUST NOT change existing game logic, game event handlers, navigation, room construction, resources, or runtime imports.

Allowed paths: src/ui/visual/v2.css (new only); src/render/visual/** (new optional export-only visual helpers, not wired); assets/ui/**; assets/sprites/**; design/v2/**; docs/V2_ACCEPTANCE.md; tests/v2-visual.test.mjs; tools/browser-v2.py. Edit NO files outside this allowlist.

PROHIBITED: index.html, src/main.js, src/ui/app.js, src/styles.css, src/ui/visual/v1.css, src/render/renderer.js, src/render/camera.js, src/core/**, src/world/**, package.json, existing tests, build/deploy settings. Do not add external CDNs/frameworks/fonts or change existing DOM IDs or CSS behavior on the live page. Do not integrate v2.css into index.html yourself. If an interaction or integration needs a forbidden edit, document a specific request for AI-A.

Deliver a visual-only PR, screenshots and test notes. Run npm test, npm run build and preview smoke tests at all specified viewport sizes. If unrelated bugs appear, report without fixing them. Before PR compare changed files to the allowlist. Open PR to main; do NOT merge it. Report exact results, not assumptions.

## Existing visual and technical contract
- V1 is active via index.html CSS order: src/styles.css then src/ui/visual/v1.css.
- The map is Canvas 2D. Current renderer is src/render/renderer.js; NEVER modify it on the visual branch.
- Live UI event bindings are in src/ui/app.js and depend on IDs; preserve these.
- The project uses vanilla ES modules. No React, UI frameworks, external icon kits, external network font loads, or background downloads.

## Art direction (proposed, adjustable by owner review)
- Identity: miniature underground civilization; readable 2D stylized nature illustrations with warm soil, moss green, amber highlights and high-contrast controls.
- Preserve map visibility: prioritize compact overlays, intentional disclosure panels and large unobstructed center viewport; avoid full-width permanently expanded dashboards.
- Distinguish visually: queen, worker, brood stages, dig orders, forage/cargo, soil/hard soil/stone/tunnel, entrance, resources and planned/built rooms.
- Do not copy assets from games or websites; every file must be newly created or licensed and documented.

## Deliverables
1. docs/V2_ACCEPTANCE.md: current V1 audit, decisions, asset inventory, technical limits and screenshots.
2. design/v2/: standalone index.html preview, mock data, notes. It can demonstrate target V2 HUD and future U5 room cards using STATIC FIXTURE data. Explicitly label mock values.
3. src/ui/visual/v2.css: CSS override only, scoped selectors, avoid !important unless justified. Respect V1 layout, safe areas and narrow landscape. Not loaded on the real game until integration.
4. assets/ui/: original icons (prefer clean vector SVG), status variants for buttons and resource types, meaningful naming and SVG viewBox. Accessible alt/title recommendations.
5. assets/sprites/: ant and brood/room/resource sprite or asset set, organized manifest with dimensions, logical anchor points and purpose. Prefer static SVG/PNG/WebP; if atlas used, include JSON cell metadata. No font binaries.
6. Optionally src/render/visual/: pure draw helpers or asset maps callable by a later renderer adapter. NO side effects on import; no touching simulation or window globals.
7. tests/v2-visual.test.mjs plus preview browser script only; no modification to existing test files.

## UX acceptance
- Test 320×568, 390×844, 768×1024, 844×390, 1440×900.
- Aim for touch controls at least 44×44 CSS px and readable text/contrast (WCAG AA where practical).
- Avoid horizontal page overflow, obscured speed/zoom/seed/layer/dig controls, decorative overlays intercepting pointer input, and UI panels that cover the entire game by default.
- Make disabled, active and selected states distinguishable without relying only on color.
- Account for safe-area inset on iPhone, landscape and reduced motion preferences.
- Ensure icons remain identifiable at 16/24/32px and ant sprites at game scale, not only at large preview scale.
- Preview game-mode overlays without asserting they work in live gameplay.

## Exit criteria and report
- Changed-file list contains only allowed new paths.
- npm test + npm run build: pass on current branch (report command outputs).
- Independent preview loads without console errors or missing assets; screenshots at all 5 sizes.
- Document integration hook requests by filename/selectors rather than editing production files.
- Submit PR with no merge and include list of unrelated bugs discovered (not fixed).

## When U5 is in progress
Do NOT reference unmerged U5 DOM IDs or modify provisional U5 CSS. Show planned room indicators only as static fixtures; integration owner later maps the final U5 state to the art.
