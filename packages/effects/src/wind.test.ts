import { describe, expect, it } from 'vitest';

import { computeBendAmount, DEFAULT_WIND_CONFIG } from './wind';

const base = {
  flexibility: 1,
  procedural: 0,
  cursorInfluence: 1,
  cursorStrength: 0.06,
  audioWind: 0,
  audioStrength: 0.03,
  stiffness: 1,
  intensity: 1,
  reducedMotion: false,
};

describe('computeBendAmount', () => {
  it('never bends the anchored base (flexibility 0)', () => {
    expect(computeBendAmount({ ...base, flexibility: 0 })).toBe(0);
  });

  it('bends more toward the tip', () => {
    const mid = computeBendAmount({ ...base, flexibility: 0.25 });
    const tip = computeBendAmount({ ...base, flexibility: 1 });
    expect(tip).toBeGreaterThan(mid);
  });

  it('stiffer layers bend less', () => {
    const soft = computeBendAmount({ ...base, stiffness: 1 });
    const stiff = computeBendAmount({ ...base, stiffness: 5 });
    expect(stiff).toBeLessThan(soft);
    expect(stiff).toBeCloseTo(soft / 5, 6);
  });

  it('cursor influence increases the bend', () => {
    const far = computeBendAmount({ ...base, cursorInfluence: 0 });
    const near = computeBendAmount({ ...base, cursorInfluence: 1 });
    expect(near).toBeGreaterThan(far);
  });

  it('audio energy adds bend, scaled by audioStrength', () => {
    const silent = computeBendAmount({ ...base, audioWind: 0 });
    const loud = computeBendAmount({ ...base, audioWind: 1 });
    expect(loud).toBeGreaterThan(silent);
    expect(loud - silent).toBeCloseTo(base.audioStrength, 6);
  });

  it('reduced motion attenuates the bend', () => {
    const normal = computeBendAmount({ ...base, reducedMotion: false });
    const reduced = computeBendAmount({ ...base, reducedMotion: true });
    expect(reduced).toBeLessThan(normal);
    expect(reduced).toBeCloseTo(normal * 0.3, 6);
  });

  it('intensity 0 disables the bend entirely', () => {
    expect(computeBendAmount({ ...base, intensity: 0 })).toBe(0);
  });

  it('clamps out-of-range inputs and stays finite', () => {
    expect(computeBendAmount({ ...base, flexibility: 5 })).toBe(
      computeBendAmount({ ...base, flexibility: 1 }),
    );
    expect(computeBendAmount({ ...base, audioWind: 9 })).toBe(
      computeBendAmount({ ...base, audioWind: 1 }),
    );
    // stiffness below 1 is floored, never amplifying or dividing by ~0
    expect(computeBendAmount({ ...base, stiffness: 0 })).toBe(
      computeBendAmount({ ...base, stiffness: 1 }),
    );
    expect(Number.isFinite(computeBendAmount({ ...base, procedural: Number.NaN }))).toBe(true);
  });

  it('ships sane defaults', () => {
    expect(DEFAULT_WIND_CONFIG.enabled).toBe(true);
    expect(DEFAULT_WIND_CONFIG.stiffness).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_WIND_CONFIG.intensity).toBeLessThanOrEqual(1);
  });
});
