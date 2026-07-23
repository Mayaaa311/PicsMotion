import { describe, expect, it } from 'vitest';

import { MAX_SPLASH, SPLASH_LIFETIME, SplashField } from './spiderverse';

describe('SplashField', () => {
  it('starts empty', () => {
    expect(new SplashField().active).toHaveLength(0);
  });

  it('records splashes along the path', () => {
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

  it('strength decays from 1 to 0 over the lifetime', () => {
    const f = new SplashField();
    f.add(0.5, 0.5, 0);
    expect(f.strengthAt(0, 0)).toBeCloseTo(1, 5);
    expect(f.strengthAt(0, SPLASH_LIFETIME / 2)).toBeCloseTo(0.5, 2);
    expect(f.strengthAt(0, SPLASH_LIFETIME * 2)).toBe(0);
  });

  it('prune() drops fully-faded splashes', () => {
    const f = new SplashField();
    f.add(0.5, 0.5, 0);
    f.add(0.6, 0.6, SPLASH_LIFETIME + 5 - 0.1);
    f.prune(SPLASH_LIFETIME + 5);
    expect(f.active).toHaveLength(1);
  });

  it('strengthAt is 0 for an out-of-range index', () => {
    expect(new SplashField().strengthAt(3, 0)).toBe(0);
  });
});
