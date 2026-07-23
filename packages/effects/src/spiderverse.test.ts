import { describe, expect, it } from 'vitest';

import { MAX_SPLASH, SPLASH_LIFETIME, shouldStamp, SplashField } from './spiderverse';

describe('SplashField', () => {
  it('starts empty', () => {
    expect(new SplashField().active).toHaveLength(0);
  });

  it('records stamps along the path', () => {
    const f = new SplashField();
    f.add(0.2, 0.3, 0);
    f.add(0.4, 0.5, 0.1);
    expect(f.active).toHaveLength(2);
  });

  it('caps the pool at MAX_SPLASH, evicting the oldest', () => {
    const f = new SplashField();
    for (let i = 0; i < MAX_SPLASH + 5; i++) f.add(0.5, 0.5, i);
    expect(f.active).toHaveLength(MAX_SPLASH);
    expect(f.active[0]!.born).toBe(5);
  });

  it('ages from 0 (fresh) to 1 (gone) over the lifetime', () => {
    const f = new SplashField();
    f.add(0.5, 0.5, 0);
    expect(f.ageAt(0, 0)).toBeCloseTo(0, 5);
    expect(f.ageAt(0, SPLASH_LIFETIME / 2)).toBeCloseTo(0.5, 2);
    expect(f.ageAt(0, SPLASH_LIFETIME * 2)).toBe(1);
  });

  it('prune() drops fully-faded stamps', () => {
    const f = new SplashField();
    f.add(0.5, 0.5, 0);
    f.add(0.6, 0.6, SPLASH_LIFETIME + 5 - 0.1);
    f.prune(SPLASH_LIFETIME + 5);
    expect(f.active).toHaveLength(1);
  });

  it('ageAt is 1 for an out-of-range index', () => {
    expect(new SplashField().ageAt(3, 0)).toBe(1);
  });
});

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
