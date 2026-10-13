# U6.1 Rework — Military Management and Tap-to-Rally

## What was wrong before
- The game began with **zero assigned soldiers**. Users could not see military units doing anything.
- The old dialog expected the map tile to have been selected in a completely separate action, making rally cumbersome.
- Soldier AI prioritized any enemy anywhere, so distant enemies could cancel the practical effect of an active rally command.
- New controls must not break the integrated V2/V2.1 UI or legacy worker, foraging and construction controls.

## New behavior
- One of the five initial workers is automatically assigned guard duty. It is a real worker in the colony; population does not grow magically. Two default forage slots and one nurse slot are retained.
- A persistent tactical dock exposes **ทหาร**, **รวมพล** and **ป้องกัน**, including a live real-soldier/target count and threat badge.
- Tap **รวมพล** → tap any physically reachable walkable tile in the current layer. The code uses the existing Canvas pointer handler and deliberately distinguishes a tap from dragging/pinch. On invalid or isolated terrain the player receives feedback without creating a dig/build order.
- The military dialog lists every existing worker: soldier / regular worker, task, physical tile and soldier HP. Per-ant buttons support **เกณฑ์**, **ปลด** and **ดู** to center the camera and switch map layers.
- Individual recruitment is permitted only for genuinely eligible, unassigned workers (not foragers, nurses, diggers or builders). Explicit release lowers the target quota so the same unit is not immediately replaced. Injuries persist.
- A squad gathers at a genuine walkable position using A* and the existing portal; additional soldiers take different nearby reachable cells where possible.
- In rally mode only nearby enemy threats interrupt a formation move; defend mode still intercepts more distant threats. Retreat and resting preserve their existing semantics.
- Reset world starts with the default one-soldier garrison, but no old rally or enemy counters.

## Test expectations and gate
- Local gameplay tests: 84/84 pass, consisting of the previous U1–U6 suite updated for the intentional initial garrison plus seven additional U6.1 cases.
- Local browser smoke: five viewports each for U6 and the new tactical map-tap harness, and regression for U2–U5; no uncaught JS exceptions in the checked harnesses.
- Browser defects found and fixed during development: roster initially opened blank because update occurred before showModal; quick tactical controls on short landscape were covering the U3 forage '+' button. Adjusted update timing and landscape dock position.
- CI must rerun gameplay, V2.1 interactions and actual Canvas controls before merge. An unverified local browser fixture is not proof of a live AWS-hosted build.
- Changed files are U6-owned combat logic, UI bridge, military CSS/dialog, associated tests, workflow and this report only. No V1, V2 or V2.1 visual files are altered.

## Deliberate limits
- One shared squad (not multiple named groups). Soldier units still come from workers, not a separately bred caste.
- No consumable healing items, projectile combat or soldier equipment; those are not asserted here.
- Moving ants may pass each other because the base U2 grid navigation does not model per-ant traffic collision.
- AWS Amplify deployed URL and tests on physical devices require independent verification.
