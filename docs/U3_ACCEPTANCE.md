# U3 Acceptance — Foraging & Transport

## Scope completed

1. Deterministic, spaced source placement on accessible surface cells; carbohydrates, protein, water; finite quantity.
2. Two default foragers out of the five U2 workers; controls adjust assignment from 0–5. Digging uses remaining workers. Busy assignments finish before reallocation takes effect.
3. Real underground → surface → source → surface portal → underground → starting-chamber route, with cardinal walkability checks and no teleport to resources.
4. Five-tick pickup, cargo capacity 3, atomic reservation and collection, deposit only at a reachable indoor cache position.
5. Surface source rendering, cargo markers, inventory HUD and surface source inspector.
6. New world resets supplies, stock, worker positions and the clock.
7. Regression tests for U1/U2 and independent U3 tests.

## Quality checklist

- [x] No resource may be picked up twice: stock reserved + available follows source amount.
- [x] Total invariant: `sum(initial sources) = sum(remaining sources) + sum(cargo) + sum(deposited)`.
- [x] No worker crosses rock, thicket, stone or water as an on-foot tile.
- [x] Paused time does not move workers or change inventory.
- [x] Surface/underground view switching cannot stop simulation or duplicate goods.
- [x] Digging and foraging work concurrently; queued digging retained.
- [x] Touch-oriented UI and Chromium viewport smoke tests.
- [x] Fresh world resets all state, and same seed reproduces resources.

## Deferred

- Source renewal, predator interactions, food spoilage or colony consumption are U4–U7, not silently simulated in U3.
- The initial cache is a physical delivery point without room capacity enforcement (U5).
- No saves across browser refreshes yet (U8).
- Browser smoke tests use concatenated ES-module code because sandbox Chromium is network-restricted; a live deployed-page smoke test is still required.
