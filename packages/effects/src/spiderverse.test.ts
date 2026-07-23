import { describe, expect, it } from 'vitest';

import { interpolateStamps, shouldStamp } from './spiderverse';

describe('shouldStamp', () => {
  it('always stamps when there is no previous stamp', () => {
    expect(shouldStamp(null, { x: 0.5, y: 0.5 }, 0.02)).toBe(true);
  });
  it('stamps only once the cursor has travelled past the spacing', () => {
    const prev = { x: 0.5, y: 0.5 };
    expect(shouldStamp(prev, { x: 0.51, y: 0.5 }, 0.02)).toBe(false);
    expect(shouldStamp(prev, { x: 0.53, y: 0.5 }, 0.02)).toBe(true);
  });
});

describe('interpolateStamps', () => {
  it('returns the point itself when there is no previous', () => {
    expect(interpolateStamps(null, { x: 0.3, y: 0.4 }, 0.02)).toEqual([{ x: 0.3, y: 0.4 }]);
  });

  it('returns nothing when movement is below spacing', () => {
    expect(interpolateStamps({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.5 }, 0.02)).toEqual([]);
  });

  it('lays evenly-spaced points along a fast move, ending at the cursor', () => {
    const pts = interpolateStamps({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.02);
    expect(pts.length).toBe(5);
    expect(pts[pts.length - 1]).toEqual({ x: 0.1, y: 0 });
    // roughly even spacing
    expect(pts[0]!.x).toBeCloseTo(0.02, 6);
  });

  it('caps the number of points on a huge jump', () => {
    const pts = interpolateStamps({ x: 0, y: 0 }, { x: 5, y: 0 }, 0.02, 24);
    expect(pts.length).toBe(24);
    expect(pts[pts.length - 1]).toEqual({ x: 5, y: 0 });
  });
});
