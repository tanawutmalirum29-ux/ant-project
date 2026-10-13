import { createRandom } from '../core/random.js';
import { SURFACE } from './generate.js';
import { isWalkable, reachablePaths } from './navigation.js';

export const RESOURCE_TYPES = Object.freeze(['carbs', 'protein', 'water']);
export const RESOURCE_LABELS = Object.freeze({ carbs: 'น้ำหวานและเมล็ด', protein: 'แมลงและโปรตีน', water: 'น้ำ' });
const kindFor = Object.freeze({ carbs: 'nectar', protein: 'insect', water: 'droplet' });

/** Fixed, seed-deterministic and reachable sources. An opt-in ecology engine
 * may renew these same sites after harvesting; site positions never respawn. */
export function createResourceNodes(world) {
  const layer = world.layers[SURFACE];
  const start = world.entrances[0].surface;
  const paths = reachablePaths(layer, start);
  if (!paths) throw new Error('Surface nest portal is unreachable');
  const rng = createRandom(world.seed ^ 0x7ab18f25);
  const candidates = [];
  for (let y = Math.max(1, start.y - 26); y <= Math.min(layer.height - 2, start.y + 26); y++) {
    for (let x = Math.max(1, start.x - 26); x <= Math.min(layer.width - 2, start.x + 26); x++) {
      const d = paths.distance(x, y);
      if (d >= 6 && d <= 36 && isWalkable(layer, x, y)) candidates.push({ x, y, distance: d, sort: rng.next() });
    }
  }
  candidates.sort((a,b) => (a.sort - b.sort));
  const selected = [];
  // Place close enough to the nest that early foraging is visible, but never on top of other sources.
  for (const spot of candidates) {
    if (selected.length === 24) break;
    if (selected.some(other => Math.abs(spot.x - other.x) + Math.abs(spot.y - other.y) < 5)) continue;
    selected.push(spot);
  }
  if (selected.length < 9) throw new Error('Unable to generate enough reachable food sources');
  const types = [...RESOURCE_TYPES, ...RESOURCE_TYPES, ...RESOURCE_TYPES];
  return selected.map((p,i) => {
    const type = types[i % types.length];
    return { id: `resource-${i+1}`, x:p.x, y:p.y, type, kind:kindFor[type],
      amount: 16 + rng.int(0,8) * 2, initialAmount: 0, reserved:0, distance:p.distance };
  }).map(node => ({
    ...node,
    initialAmount: node.amount,
    maxAmount: node.amount,
    regrowthProgress: 0
  }));
}
