# U1 — Acceptance & Test Report

Date: 2026-10-13 | Version: 0.1.0

## Delivered

- U1.1 Module split: UI, core, world, render, tests, local static dev server.
- U1.2 10 TPS fixed-step clock with 0/x1/x2/x4; no timer tied to rendering FPS.
- U1.3 Seeded generation: 128×128 surface / 96×64 underground, terrain IDs and shared entrance.
- U1.4 Canvas rendering, visible-tile culling, pan/wheel/pinch/selection/resize/orientation.
- U1.5 Two independently positioned cameras, one shared Game + world + clock.
- U1.6 Responsive compact HUD; debug FPS/TPS/ticks/sim time/render time/pending tasks.
- U1.7 Node `npm test` checks deterministic seeds, clock, portal, transforms and state preservation.

## Validation performed

- `npm test`: 5/5 passing.
- Chromium UI smoke: 1440×900 desktop, 390×844 mobile portrait, 844×390 landscape all passed. Verified clock progresses, pause freezes clock, speed 2 advances faster, toggles retain world, debug opens, seed resets clock/world, and no horizontal scroll or JS page errors.
- Browser sandbox blocked local HTTP navigation; for UI smoke we injected a combined copy of the same modules and stylesheet into Chromium's document. Node module tests validate the original module imports separately. Therefore real HTTP module loading should still be checked when serving on GitHub Pages / local static server.
- Headless Chromium performance is **not** a representative mobile benchmark; no FPS guarantee claimed.

## Known scope limits

- Population is 0 in U1: ants are entities to implement in U2. No mock resources or fake worker jobs.
- Digging, pathfinding, AI, combat and saves are intentionally not implemented in this phase.
- The entrance is a shared portal identifier and location; ant travel through it is U3.
- x4 speed is experimental pending real-device profiling.

## U2 integration points

- `game.onTick(fn)` for deterministic simulation systems.
- `game.world.layers[layer].cells` for grid and terrain changes.
- `portalAt(world, layer, x, y)` for shared colony entrance.
- `Camera.screenToCell()` for selection, `Renderer.render()` for adding ant visual layer.
