/** Small, pure math utilities shared across the runtime. All are allocation-free. */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between `a` and `b` by `t`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential smoothing ("damp"). Moves `current` toward
 * `target`; `lambda` is the smoothing rate (larger = faster). `dt` in seconds.
 * Derived from the standard exp-decay: current += (target-current)*(1-e^{-λdt}).
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * Simple exponential smoothing used by the audio engine:
 *   smoothed = previous + factor * (current - previous)
 * `factor` in [0,1]; higher reacts faster.
 */
export function expSmooth(previous: number, current: number, factor: number): number {
  return previous + clamp(factor, 0, 1) * (current - previous);
}

/** Map `value` from range [inMin,inMax] to [outMin,outMax] without clamping. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax - inMin === 0) return outMin;
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

/** Convert a normalized [0,1] coordinate to centered [-1,1]. */
export function toCentered(normalized: number): number {
  return normalized * 2 - 1;
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'exponential';

/** Apply a named easing curve to `t` in [0,1]. */
export function applyEasing(t: number, curve: EasingName): number {
  const x = clamp(t, 0, 1);
  switch (curve) {
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'exponential':
      return x === 0 ? 0 : Math.pow(2, 10 * (x - 1));
    case 'linear':
    default:
      return x;
  }
}
