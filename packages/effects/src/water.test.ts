import { describe, expect, it } from 'vitest';

import { MAX_RIPPLES, RippleManager } from './water';

describe('RippleManager', () => {
  it('starts empty', () => {
    expect(new RippleManager().active).toHaveLength(0);
  });

  it('records a ripple with clamped centre and sane defaults', () => {
    const m = new RippleManager();
    m.add([1.5, -0.2], 10);
    const r = m.active[0]!;
    expect(r.center).toEqual([1, 0]); // clamped into [0,1]
    expect(r.startTime).toBe(10);
    expect(r.amplitude).toBeGreaterThan(0);
    expect(r.decay).toBeGreaterThan(0);
  });

  it('caps the pool at MAX_RIPPLES, evicting the oldest', () => {
    const m = new RippleManager();
    for (let i = 0; i < MAX_RIPPLES + 4; i++) m.add([0.5, 0.5], i);
    expect(m.active).toHaveLength(MAX_RIPPLES);
    // The oldest (startTime 0..3) were evicted.
    expect(m.active[0]!.startTime).toBe(4);
  });

  it('never lets decay be zero (avoids an immortal ripple)', () => {
    const m = new RippleManager();
    m.add([0.5, 0.5], 0, { decay: 0 });
    expect(m.active[0]!.decay).toBeGreaterThan(0);
  });

  it('prune() removes fully decayed ripples but keeps fresh ones', () => {
    const m = new RippleManager();
    m.add([0.5, 0.5], 0, { decay: 2 }); // old
    m.add([0.4, 0.4], 9.9, { decay: 2 }); // fresh at t=10
    m.prune(10);
    expect(m.active).toHaveLength(1);
    expect(m.active[0]!.startTime).toBeCloseTo(9.9, 5);
  });

  it('prune() is a no-op when everything is fresh', () => {
    const m = new RippleManager();
    m.add([0.5, 0.5], 10);
    m.prune(10);
    expect(m.active).toHaveLength(1);
  });

  it('clear() empties the pool', () => {
    const m = new RippleManager();
    m.add([0.5, 0.5], 0);
    m.clear();
    expect(m.active).toHaveLength(0);
  });

  it('honours explicit ripple overrides', () => {
    const m = new RippleManager();
    m.add([0.2, 0.3], 5, { amplitude: 0.05, frequency: 40, decay: 3 });
    expect(m.active[0]).toMatchObject({ amplitude: 0.05, frequency: 40, decay: 3 });
  });
});
