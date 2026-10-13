# V1 — Compact Visual HUD / Acceptance

## Scope (visual branch only)

Started at U3 commit `3b9e0309797f5b9205e4706554288e06773724c0`, then integrated U4 `39cb106993d6272efac66fb11c00f9ab307cbed9` into the **visual branch only**.
Branch: `visual-development-v1`.

V1 adds one **visual-only** stylesheet after the existing CSS. Existing element IDs, DOM event listeners, map renderer, simulation, tool logic, and U3 resource/forager data bindings stay unchanged.

- Smaller top HUD and resource chips: time, population, seed, carbs, protein, water.
- U4 visual bridge for brood status, nurse assignment and population report; no U4 logic changed.
- Compact left construction and forager allocation dock.
- Centered map-layer switch; speed/zoom/debug controls remain clickable.
- Adaptive portrait phones, narrow 320px screens, tablets, short landscape and desktop.
- Safe-area spacing, capped selection/debug overlays and reduced-motion support.
- No added fonts, icon CDN, framework, runtime dependencies, or network services.

Files in V1: `index.html` (stylesheet link only), `src/ui/visual/v1.css`, `tests/v1-ui.test.mjs`, this document.
No game logic, renderer, world generation, build rules or gameplay tests changed.

## Verification

**Automated static integration check:** `node --test tests/v1-ui.test.mjs` asserts that the complete U1–U3 control IDs, resource bindings, layer and speed buttons, game entry module, stylesheet loading order and responsive CSS contracts remain intact.

**Browser layout fixture:** Loaded representative U3 HUD markup and the V1 CSS directly into headless Chromium for five viewport sizes: 320×568, 390×844, 768×1024, 844×390, 1440×900. Verified horizontal centering of layer switch; inspected screenshot layouts; exercised fixture speed/tool/layer styling, debug button and seed modal. The fixture deliberately uses simulated visual data: it does **not** prove the actual U3 gameplay loop.

**CI sign-off:** The V1 GitHub Actions workflow runs the repository's full `npm test`, `npm run build`, checks deploy artifacts, and exercises real game interactions in Chromium at all five viewports (U3 and U4 controls). Actual hosted URL and physical phone still require manual confirmation.

## Real game manual acceptance (after merging)

1. Load the site, confirm map is visible and no console errors.
2. Switch surface/underground without losing active jobs or resources.
3. Switch inspect/dig, drag-select connected underground soil and cancel an order.
4. Adjust forager slots (+/−), confirm U3 stock numbers continue changing from gameplay.
5. Pause/x1/x2/x4, recenter/zoom on desktop, open/close Debug and seed modal.
6. Test portrait 320/390px and landscape 844×390; confirm controls do not overlap and selection panel can scroll.
7. Verify touch panning/pinch stays within the canvas and all buttons remain interactive.
8. Confirm AWS Amplify still publishes stylesheet at `/src/ui/visual/v1.css`.

## Ownership boundaries

Visual branch cannot fix U4–U8 or other engine bugs. Report non-visual failures with reproduction steps to the gameplay owner; leave unrelated files untouched.

If `main` advances, review changes to `index.html` and `src/styles.css` before merge. Update the V1 branch only after resolving UI conflicts; never force-push over the gameplay owner's commits.
