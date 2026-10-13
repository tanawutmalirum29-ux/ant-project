# Ant Kingdom U6 — Strategy & Combat Acceptance

## Actual U6 systems delivered

- A separate fixed-tick `Combat` simulation owns enemy AI, recruitable soldier workers, damage, recovery, casualty counts, threat spawning, and pheromone/rally orders.
- **Real movement:** soldiers and beetles/raiding ants use A* walkable-tile paths with one-cell adjacency checks and tile-by-tile travel. Both sides cross the linked surface/underground portal only after reaching its exact entrance coordinates. No simulated ranged teleport attack.
- **Real fights:** attack only when on the same layer within one cell. Attacks have explicit cooldowns, HP and damage. The queen has a separate hit-point budget and can die. Ordinary worker deaths invoke the existing U4 cleanup, preserving U5 carrying, nursery and construction reservations.
- **Labor allocation:** player recruits/demobilizes soldiers from currently idle, rest/patrol workers. Digging, construction, nursing and foraging are not forcibly interrupted. The requested military quota may exceed eligible workers; the visible actual count makes this explicit.
- **Orders:** defend (nearest enemy / guard station / nest mouth); rally at an actually walkable selected tile on either layer; retreat to reachable rest station or queen chamber. Wounded soldiers automatically retreat and physically regain HP at recovery locations. Demobilization must not reset injuries.
- **Threat ecology:** beetles and rival-ant raiders spawn on seeded, walkable surface locations and enter by the real nest entrance. At normal x1 speed, first natural wave is after 3,600 simulated ticks; further waves use fixed seeded 480-tick intervals, bounded to 5 active enemies. Players can deliberately trigger a threat immediately for test/interactive feedback.
- **UI:** functional, self-contained Strategy dialog injected into existing U5 tool dock without modifying existing visual V1/V2 CSS files. It exposes quota, orders, rally, invasion trigger and real-time counters. The renderer shows enemies, HP indicators, soldier rings, and rally marker.
- **Existing mechanics:** no changes to U5 rooms or logistics, U4 nursery/food and death rules, U3 forage pathing, U2 dig/camera controls, or map generator. Simulation remains independent of render FPS; pause halts combat.

## Logic invariants and tests

1. Enemy and ant positions always remain on terrain accepted by `isWalkable`.
2. Attack requires same layer and Manhattan distance <= 1; cross-layer units cannot deal direct damage.
3. Surface invaders reach the exact entrance and cross to the underground entrance; no route shortcuts.
4. Soldier slot changes do not recruit workers already handling jobs or recreate hit points.
5. Damage-driven worker death releases U4/U5 task ownership, cargo and source claims through existing `lifecycle.killWorker()`.
6. No food/water/protein appears during combat: existing U5 resource mass-balance invariant remains true.
7. Queen death stops reproduction; pause freezes movement, combat cooldowns and enemy spawning.
8. Resets make a fresh combat system, with zero prior foes, kills or selected soldiers.
9. Defensive and retreat commands change *where workers move*, not just counters.

## Repeated local QA

- `npm test`: **77/77 passed** (59 U1–U5 tests plus 18 U6 logic cases), including U5 room logistics and storage conservation.
- `npm run build`: passed; U6 JS, stylesheet and tests present in output source folder; no engine library added.
- Chromium inline-module browser harnesses: U2 3/3, U3 3/3, U4 3/3, U5 room 5/5, U5 physical storage 5/5; no page errors.
- Chromium U6 real control smoke: 320×568, 390×844, 768×1024, 844×390, 1440×900 **5/5 passed**, modal button click, soldier allocation, actual spawn, patrol movement and retreat button; no page errors.
- **Bug caught and fixed before PR:** parent `.dig-tools` was deliberately pointer-transparent in U5. The new U6 button was visible but not clickable until `pointer-events:auto` was explicitly scoped to it.
- **Logic exploit fixed:** demobilization could reset injured soldier HP. Injury is preserved when soldier quota changes.
- UI QA was run with a local U5 HTML/V1 fixture under Chromium inline ESM because the sandbox does not have live AWS access. CI on GitHub with current V2 CSS is the next independent gate.

## Deliberate limitations

- U6 is a real gameplay prototype, not tuned difficulty; threat appearance is delayed to preserve initial sandbox construction time.
- Soldier allocation uses existing idle roster; no dedicated larva-to-soldier caste differentiation yet.
- Workers do not physically carry bandages or food for healing; recovery is time-based at rest/queen locations.
- Enemy corpses, pheromone diffusion fields and advanced squad formations are not simulated; the rally command is a tile-targeted priority marker.
- AWS Amplify live deployment, phone hardware, and extended 150-worker benchmarks remain unverified.
- Do not infer the user has deployed U6 until the hosted URL is explicitly checked.
