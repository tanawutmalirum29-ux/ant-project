# V2 — Command Center UI / Visual Acceptance

## Why V1 needed replacement

V1 changed sizing and materials but left scattered corner controls. V2 introduces a distinct screen hierarchy, information priority and ant-colony visual identity:
- **Full-width command header** (brand, clock, live population and seed).
- **Unified inventory ribbon** (carbs, protein, water); no fake capacity or rates.
- **Desktop left operations desk** (inspect, dig, foraging and nurse worker assignment).
- **Portrait mobile bottom operation dock** with two-column tool / workforce structure.
- **Layer mode switch** centered below the map; right-side play speed, zoom and debug.
- **Brood status as small regional annotation**, detailed population report on demand.
- **Right contextual selection and overflow-safe details**, avoiding permanent full-width panels.
- **Illustration pack**: original vector icons for dig/explore/colony/forage/nurse/surface/underground/water, worker and queen ants, brood, optional room concept.

## Ownership & implementation

Baseline `a45df7b9030b2e6a0298a4eb656ae469f8317244` (U1–U4 merged; U5 underway in parallel).
Visual branch `visual/v2-art-ui`. Only NEW files in paths allowed by `AGENTS.md` / `WORK_BOARD.md`.
`src/ui/visual/v2.css` is **NOT linked in production**. It extends `styles.css → v1.css` only in the standalone preview `design/v2/index.html`. Integrator should enable it in a separate PR after U5 merging.

The preview uses fixed mock values. Its JavaScript only simulates UI clicks; it does not invoke the real simulation. The illustration is a static cutaway concept, not a renderer upgrade. Do not interpret mock resource values, mock speed buttons, or mock ant motion as game results.

### Asset manifest
- `assets/ui/*.svg`: eight 64px self-contained icons; designed for 16/24/32px rendering, descriptive IDs for integrator.
- `assets/sprites/worker-ant.svg`, `queen-ant.svg`, `brood.svg`, `store-room.svg`.
- `assets/sprites/manifest.json`: declared dimensions, approximate anchors, and preview-only status.
- Original assets created for this project; no external image dependencies or CDN.

### Interaction contract
V2 CSS styles existing production selectors (`topbar`, `resource-strip`, `dig-tools`, `right-controls`, `layer-switch`, `selection-card`, `colony-panel`, `debug-panel`). Existing IDs/data bindings are unchanged. V2 does not touch `src/ui/app.js` or simulate new gameplay features.

### Tests

- `npm test`: U1–U4 regressions plus dedicated `tests/v2-visual.test.mjs` for selector parity, asset paths, SVG safety and responsive rules.
- `npm run build`: unchanged production Amplify build; V2 preview assets are intentionally not packaged in `dist/` yet.
- `python tools/browser-v2.py`: optional headless Chromium visual smoke, static fixture, five sizes: 320×568, 390×844, 768×1024, 844×390, 1440×900. Writes to `design/v2/screenshots/` locally. Requires Python Playwright installed.
- `python tools/browser-v1.py`: real U1–U4 gameplay interactions without V2 enabled, available to check regression from existing game.

## Integration requests (gameplay/integration owner only)

1. After merging U5, review selectors and resolve changes to newly introduced room UI.
2. Add stylesheet link `./src/ui/visual/v2.css` to `index.html` after V1, without changing DOM IDs or runtime handlers.
3. If visual icon assets are used in production, coordinate static asset packaging: current `tools/build.mjs` copies only `index.html` and `src/`, **not** the top-level `assets/`. Integrator must either move/copy intended icons into a deployable path or update the build under a separate approved integration change.
4. Renderer art is future work: ant/queen/brood/room vectors are **preview-only** until independently wired and performance-tested.
5. Re-run U1–U5 `npm test`, build, touch/pointer, browser and AWS preview smoke before production merge.

## Outside scope

No changes to game state, time, digging, foraging, nurse allocation, resource accounting, spawning, rooms, renderer, save data, or bug fixes outside visual work. Report such issues separately.

## Exit notes

Automated evidence and viewport results should be filled with actual command output by the executing CI or browser runner. A static prototype pass is not a real mobile device or deployed Amplify pass.
