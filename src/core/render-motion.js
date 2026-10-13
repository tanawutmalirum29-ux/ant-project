import { TICK_MS } from './time.js';

/**
 * Presentation-only tile coordinates. The simulation still owns every move,
 * collision, path and portal transition; these samples never mutate units.
 */
export function unitPose(unit) {
  const progress = unit.next ? Math.max(0, Math.min(1, unit.motion ?? 0)) : 0;
  return {
    layer: unit.layer,
    x: unit.x + (unit.next ? (unit.next.x - unit.x) * progress : 0),
    y: unit.y + (unit.next ? (unit.next.y - unit.y) * progress : 0)
  };
}

export function snapshotPositions(game) {
  const positions = new Map();
  if (game.colony.queen) positions.set(game.colony.queen, unitPose(game.colony.queen));
  for (const ant of game.colony.workers) positions.set(ant, unitPose(ant));
  for (const enemy of game.combat.enemies) positions.set(enemy, unitPose(enemy));
  return positions;
}

/** Draw one completed simulation step over the following fixed-step interval. */
export function displayedPosition(game, unit) {
  const actual = unitPose(unit);
  const previous = game.renderMotion?.from.get(unit);
  const latest = game.renderMotion?.to.get(unit);
  // Spawn, portal crossing and out-of-band commands must never draw ghost motion
  // through walls or across layers.
  if (!previous || !latest || previous.layer !== latest.layer ||
      latest.layer !== actual.layer || actual.x !== latest.x || actual.y !== latest.y) return actual;

  const alpha = game.clock.speed === 0 ? 1 :
    Math.max(0, Math.min(1, game.stepper.accumulator / TICK_MS));
  return {
    layer: actual.layer,
    x: previous.x + (latest.x - previous.x) * alpha,
    y: previous.y + (latest.y - previous.y) * alpha
  };
}
