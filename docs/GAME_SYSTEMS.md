# Ant Kingdom — Current Game Systems

**Source of truth:** working code on `main`. This document records implemented features and known limitations as a reference for **the next development round, its phases and task allocation**. Scope and ownership for the next round will be defined when that work is assigned.

## Architecture and deterministic simulation

- Entry: `index.html` → `src/main.js`; `Game` coordinates `Colony`, `Foraging`, `Rooms`, `Lifecycle`, `Combat` in `src/core/game.js`.
- Fixed simulation timestep: 10 TPS with pause, x1, x2 and x4; Canvas render frame rate is independent.
- `src/world/generate.js`: seeded maps, surface 128×128 and underground 96×64, paired nest portals.
- `src/world/navigation.js`: walkable-grid routes (including A*), without per-ant traffic collision simulation.
- New world seed constructs fresh systems. No persistent saves yet.

## Colony, jobs, rooms and resources

- `src/core/colony.js`: queen, worker entities, excavation queue, assignments and walk/dig progression.
- `src/core/foraging.js`: finite food/water nodes, gathering reservations, carrying and physical delivery. Carbs/protein/water inventory updates when deposited.
- `src/core/rooms.js`: connected and cleared room placement, building tasks, materials, storage capacities, nursery/rest/guard facilities. Separate local stock and logistics for connected finished rooms.
- `src/core/lifecycle.js`: brood stages, nursing and brood relocation, consumption, hunger/thirst, aging, natural and combat-triggered deaths.
- Critical conservation invariant (accounting for all resource types): initial sources + explicit test injections = remaining sources + worker cargo + stock + consumed + lost + materials held + materials spent. Reservations are not additional resource units.
- Storage-full and disconnected-room cases must never create or lose food. Material recovery and job cleanup must remain deterministic.

## Defense and commands

- `src/core/combat.js`: initial soldier allocation of 1 from the existing 5 workers, one shared squad, threats and physical attack movement, proximity checks, health, cooldown and defense modes.
- `src/ui/combat-controls.js`: persistent tactical actions, roster with per-ant recruit/release/view, location focus, rally-target picking.
- Rally command: press rally, tap accessible tile, actual soldiers pathfind there; far-off threats should not override the rally. Defend and retreat are separate command modes.
- Enemy movement and combat cannot teleport through an unwalkable cell, attack over long distance, or attack across different layers.

## Visual/runtime entry points

- `src/render/renderer.js`, `src/render/camera.js`: Canvas map, ant and enemy visualization, rooms, indicators.
- `src/ui/app.js`: world/tool/selection/touch interactions; `src/ui/visual/` holds integrated CSS and helper controls.
- `assets/` contains original visual source assets; `design/v2/` is an **isolated mock and visual regression fixture** because tests reference it. Do not mistake it for the deployed game.
- `tools/build.mjs` publishes `index.html` and `src/` into `dist/`. Top-level `assets/` or `design/` are not automatically published by that build unless the build logic is deliberately updated.

## Quality gates for any future assigned change

```bash
npm test
npm run build
```

Tests under `tests/`, Chromium harnesses under `tools/browser-*.py`, and GitHub Actions in `.github/workflows/` remain preserved. A successful build/CI check is not equivalent to verified AWS Amplify production access. New code changes must rerun relevant regressions and preserve engine and UI behavior.

## Current known limits

- No save/load across full page refresh.
- One shared army; no multiple selectable independent squads, special equipment or projectile system.
- No per-ant traffic collision reservation.
- Food consumption is still based on pooled accounting; ants do not all physically visit a store to eat.
- Cancelling construction can refund instantly rather than by physical return trips.
- No verified live-AWS or physical-phone sign-off is recorded by this document.
- Gameplay balance and performance at high population require measurement, not assumptions.

## Development handoff status

**Ant Kingdom is an active, continuing project.** The latest delivery round through the U6.1 military-command improvements is complete. The codebase, playable features, assets, checks and deployment setup remain available as the baseline for the next round.

**Next step:** receive and review the upcoming development scope, split it into phases, and assign contributors and file ownership afresh. Re-check integration and regression tests before merging new work.
