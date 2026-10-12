export const TICK_MS = 100;
export const TICKS_PER_SECOND = 10;
export const GAME_MINUTES_PER_TICK = 0.3; // One game day = eight real minutes at x1.
export const SPEEDS = Object.freeze([0, 1, 2, 4]);

export function createClock() { return { ticks: 0, speed: 1 }; }
export function advanceClock(clock, count = 1) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid tick count');
  clock.ticks += count;
  return clock;
}
export function setSpeed(clock, speed) {
  if (!SPEEDS.includes(speed)) throw new RangeError('Unsupported simulation speed');
  clock.speed = speed;
}
export function getGameTime(clock) {
  const absoluteMinutes = 360 + clock.ticks * GAME_MINUTES_PER_TICK;
  const minuteOfDay = Math.floor(absoluteMinutes % 1440);
  return {
    day: Math.floor(absoluteMinutes / 1440) + 1,
    hours: Math.floor(minuteOfDay / 60),
    minutes: minuteOfDay % 60,
    totalMinutes: absoluteMinutes
  };
}
export function formatGameTime(clock) {
  const { day, hours, minutes } = getGameTime(clock);
  return `วันที่ ${day} · ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
/** Separate real-frame scheduling from the deterministic fixed-step clock. */
export class FixedStepper {
  constructor(step, clock = createClock()) {
    this.step = step;
    this.clock = clock;
    this.accumulator = 0;
  }
  update(realDeltaMs) {
    if (this.clock.speed === 0) return 0;
    this.accumulator += Math.max(0, Math.min(realDeltaMs, 250)) * this.clock.speed;
    let count = 0;
    while (this.accumulator >= TICK_MS && count < 32) {
      this.step();
      advanceClock(this.clock);
      this.accumulator -= TICK_MS;
      count++;
    }
    if (count === 32) this.accumulator = 0;
    return count;
  }
  changeSpeed(speed) {
    setSpeed(this.clock, speed);
    if (speed === 0) this.accumulator = 0;
  }
}
