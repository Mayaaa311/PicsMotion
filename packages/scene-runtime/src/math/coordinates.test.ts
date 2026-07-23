import { describe, expect, it } from 'vitest';

import {
  computeStageSize,
  layerCenterWorld,
  layerDepthZ,
  layerPlaneSize,
  parallaxOffsetWorld,
  visibleWorldSize,
} from './coordinates';

const fullFrameBounds = { bounds: { x: 0, y: 0, width: 1, height: 1 } };

describe('visibleWorldSize', () => {
  it('scales with distance and aspect', () => {
    const v = visibleWorldSize(45, 6, 16 / 9);
    expect(v.height).toBeGreaterThan(0);
    expect(v.width / v.height).toBeCloseTo(16 / 9, 5);
  });
});

describe('computeStageSize (contain fit)', () => {
  it('fits a wide image by width', () => {
    const visible = { width: 16, height: 9 };
    const stage = computeStageSize(2, visible); // image wider than viewport
    expect(stage.width).toBeCloseTo(16, 5);
    expect(stage.height).toBeCloseTo(8, 5);
  });
  it('fits a tall image by height', () => {
    const visible = { width: 16, height: 9 };
    const stage = computeStageSize(0.5, visible); // portrait image
    expect(stage.height).toBeCloseTo(9, 5);
    expect(stage.width).toBeCloseTo(4.5, 5);
  });
  it('always keeps the image within the visible rect', () => {
    const visible = { width: 10, height: 10 };
    for (const aspect of [0.3, 1, 1.7, 3]) {
      const stage = computeStageSize(aspect, visible);
      expect(stage.width).toBeLessThanOrEqual(visible.width + 1e-6);
      expect(stage.height).toBeLessThanOrEqual(visible.height + 1e-6);
    }
  });
});

describe('layer placement', () => {
  it('centers a full-frame layer at the origin', () => {
    const c = layerCenterWorld(fullFrameBounds, { width: 10, height: 6 });
    expect(c.x).toBeCloseTo(0, 5);
    expect(c.y).toBeCloseTo(0, 5);
  });
  it('places a top-left quadrant layer up and to the left', () => {
    const c = layerCenterWorld({ bounds: { x: 0, y: 0, width: 0.5, height: 0.5 } }, { width: 10, height: 6 });
    expect(c.x).toBeLessThan(0);
    expect(c.y).toBeGreaterThan(0);
  });
  it('sizes a full-frame plane to the stage', () => {
    const s = layerPlaneSize(fullFrameBounds, { width: 10, height: 6 });
    expect(s).toEqual({ width: 10, height: 6 });
  });
  it('orders depth away from the camera', () => {
    expect(layerDepthZ(0)).toBe(0);
    expect(layerDepthZ(1)).toBeLessThan(layerDepthZ(0));
  });
});

describe('parallaxOffsetWorld', () => {
  const stage = { width: 10, height: 6 };
  const layer = {
    movement: {
      enabled: true,
      maxOffsetX: 0.05,
      maxOffsetY: 0.05,
      maxOffsetZ: 0,
      maxRotation: 0,
      parallaxStrength: 1,
      dragEnabled: false,
      returnMode: 'spring' as const,
    },
    revealBudget: { maxOffsetX: 0.05, maxOffsetY: 0.05, confidence: 1 },
  };

  it('returns zero when movement disabled', () => {
    const off = parallaxOffsetWorld(
      { x: 1, y: 1 },
      { ...layer, movement: { ...layer.movement, enabled: false } },
      stage,
      1,
      false,
    );
    expect(off).toEqual({ x: 0, y: 0 });
  });

  it('clamps to the smaller of movement and reveal budget', () => {
    const off = parallaxOffsetWorld({ x: 1, y: 1 }, layer, stage, 5, false);
    // maxFrac = 0.05, so world offset cannot exceed 0.05 * stage dimension.
    expect(Math.abs(off.x)).toBeLessThanOrEqual(0.05 * stage.width + 1e-9);
    expect(Math.abs(off.y)).toBeLessThanOrEqual(0.05 * stage.height + 1e-9);
  });

  it('attenuates under reduced motion', () => {
    const normal = parallaxOffsetWorld({ x: 0.1, y: 0 }, layer, stage, 0.2, false);
    const reduced = parallaxOffsetWorld({ x: 0.1, y: 0 }, layer, stage, 0.2, true);
    expect(Math.abs(reduced.x)).toBeLessThan(Math.abs(normal.x));
  });
});
