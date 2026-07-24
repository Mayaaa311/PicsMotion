import { describe, expect, it } from 'vitest';

import { applyEasing, clamp, expSmooth, lerp, mapRange, toCentered } from './math';

describe('clamp', () => {
  it('bounds values into range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('lerp / mapRange', () => {
  it('interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it('maps ranges', () => {
    expect(mapRange(0.5, 0, 1, 0, 100)).toBe(50);
    expect(mapRange(5, 0, 0, 0, 100)).toBe(0); // guards divide-by-zero
  });
});

describe('expSmooth', () => {
  it('moves toward the target and converges', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = expSmooth(v, 1, 0.2);
    expect(v).toBeGreaterThan(0.99);
    expect(v).toBeLessThanOrEqual(1);
  });
  it('a factor of 1 snaps immediately', () => {
    expect(expSmooth(0, 1, 1)).toBe(1);
  });
  it('a factor of 0 does not move', () => {
    expect(expSmooth(0.3, 1, 0)).toBe(0.3);
  });
});

describe('toCentered', () => {
  it('maps [0,1] to [-1,1]', () => {
    expect(toCentered(0)).toBe(-1);
    expect(toCentered(0.5)).toBe(0);
    expect(toCentered(1)).toBe(1);
  });
});

describe('applyEasing', () => {
  it('keeps endpoints and clamps input', () => {
    for (const curve of ['linear', 'easeIn', 'easeOut', 'exponential'] as const) {
      expect(applyEasing(0, curve)).toBeCloseTo(0, 5);
      expect(applyEasing(1, curve)).toBeCloseTo(1, 5);
    }
    expect(applyEasing(2, 'linear')).toBe(1);
    expect(applyEasing(-1, 'linear')).toBe(0);
  });
});
