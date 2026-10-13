# U5 — Rooms & Economy / Acceptance and AI handoff

## Scope delivered (Gameplay lane AI-A only)

- New deterministic `Rooms` system with stable IDs, tile footprints, physical construction by idle worker ants, construction progress, room orders, cancellation/refunds and connectivity.
- Queen chamber exists from spawn. Placeable 2x2 rooms: nursery, food store, water store, worker rest and guard-preparation. No U6 combat behavior is claimed.
- Every room must occupy fully excavated, walkable underground cells, avoid existing rooms/portal and be reachable from the queen chamber. Disconnected/incomplete rooms grant zero capacity or brood effects.
- Queueing a room **reserves delivered real carbohydrates/protein** immediately (stored in `rooms.held`). Cancellation refunds in full; completion transfers held materials to `rooms.spent`. Worker death returns construction to pending without recharging.
- Per-resource stock limits: baseline 24 carbs / 24 protein / 24 water; completed food store +40 carbs/+40 protein, completed water store +50 water. Existing excess remains when room is disabled; additional deposits stop until free capacity exists. Foragers do partial deposits and hold remaining cargo safely rather than deleting or cloning it.
- Completed nursery increases brood capacity +8 above existing 18; completed rest station attracts idle workers and slows hunger (half-rate while physically resting). Guard-preparation room is a real constructed footprint but combat guard bonuses are reserved for U6.
- Existing dig/inspect/forage/nurse, Seed reset, pause/speed and surface/underground interactions remain available. New room tool, selector, build-cost label, room/status panel, cancel order, capacity summary and renderer highlights added to existing UI. The gameplay owner wired UI only; `src/ui/visual/v1.css` and all V2 ownership paths were left untouched.
- Renderer draws simple functional room highlights and progress bars pending the separate visual AI's V2 art package.

## Mass balance
For each nutrient type (carbs/protein/water):

`initial resource sources + any explicitly injected test stock = surface remaining + worker carried + warehouse inventory + lifecycle.consumed + lifecycle.lost + rooms.held + rooms.spent`

Reservations on a surface node are **claims**, not physical quantities; do not add them to the mass balance. Building cancellation transfers held material back to inventory. Constructed rooms confer capacity, not food creation.

## Quality checks

- `npm test`: 51/51 Node tests, 36 existing (U1–U4) + 15 U5 room/economy tests.
- `python tools/browser-smoke.py`, `browser-u3.py`, `browser-u4.py`: 3 screens each, no uncaught JS errors; 9/9 tests.
- `python tools/browser-u5.py`: 320×568, 390×844, 768×1024, 844×390, 1440×900; 5/5 active room tool, real pointer selection, cancellation, worker building and Seed reset.
- `npm run build`: static deployment bundle verified. Existing V1 stylesheet is taken unchanged from GitHub main and not rewritten by this branch. Sandbox inline-module Chromium checks are *not* hosted AWS tests; local V1 stylesheet is a smoke-test placeholder, not a test of final V1/V2 styling.
- Checks cover 4,800-tick resource conservation, full/partial storage with resumed delivery, construction connectivity changes, worker death, pause/x4, room overlap, blocked soil, successful build, seed reset, rest worker reallocation.

## Known limits / integration notes

- The map uses an underlying walkable tunnel tile grid; room drawings overlay those tiles, without modifying grid cell type. A room footprint currently uses 2×2 contiguous cleared squares with no rotation.
- Food is currently represented by aggregate per-type capacity, not per-warehouse tile inventories. Warehouse improvements dynamically affect aggregate capacity.
- Additional full inventories cause foragers holding cargo to wait (not an engine deadlock); they resume when consumption/building creates space.
- Saved game serialization, stochastic cave-ins and disasters are future phases. Physical-device and AWS deployed URL verification remain open.
- AI-B V2 must be merged/integrated separately according to `AGENTS.md`; no V2 visuals or runtime imports were modified here.
