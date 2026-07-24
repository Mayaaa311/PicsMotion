import { describe, expect, it } from 'vitest';

import { BeatDetector } from './beat-detector';

/** Feed a flat baseline so the adaptive threshold has history to work with. */
function warmUp(d: BeatDetector, samples = 12, flux = 0.1, startTime = 0, step = 1 / 60): number {
  let t = startTime;
  for (let i = 0; i < samples; i++) {
    d.push(flux, t);
    t += step;
  }
  return t;
}

describe('BeatDetector', () => {
  it('does not fire before it has enough history', () => {
    const d = new BeatDetector({ minHistory: 8 });
    let fired = false;
    let t = 0;
    for (let i = 0; i < 5; i++) {
      if (d.push(1, t).isBeat) fired = true;
      t += 1 / 60;
    }
    expect(fired).toBe(false);
  });

  it('fires on a clear transient above the adaptive threshold', () => {
    const d = new BeatDetector();
    const t = warmUp(d);
    const res = d.push(1.0, t); // large spike vs 0.1 baseline
    expect(res.isBeat).toBe(true);
    expect(res.strength).toBeGreaterThan(0);
    expect(res.strength).toBeLessThanOrEqual(1);
  });

  it('does not fire on a flat signal', () => {
    const d = new BeatDetector();
    let t = warmUp(d, 30, 0.2);
    let fired = 0;
    for (let i = 0; i < 30; i++) {
      if (d.push(0.2, t).isBeat) fired++;
      t += 1 / 60;
    }
    expect(fired).toBe(0);
  });

  it('respects the minimum inter-beat interval', () => {
    const d = new BeatDetector({ minIntervalSeconds: 0.2 });
    let t = warmUp(d);
    expect(d.push(1.0, t).isBeat).toBe(true);
    t += 0.05; // well inside the cooldown
    expect(d.push(1.0, t).isBeat).toBe(false);
    t += 0.3; // past the cooldown
    expect(d.push(1.5, t).isBeat).toBe(true);
  });

  it('reset() clears history and cooldown', () => {
    const d = new BeatDetector();
    const t = warmUp(d);
    expect(d.push(1.0, t).isBeat).toBe(true);
    d.reset();
    // With history cleared it must warm up again before firing.
    expect(d.push(1.0, t + 0.5).isBeat).toBe(false);
  });

  it('tolerates non-finite input', () => {
    const d = new BeatDetector();
    const t = warmUp(d);
    expect(() => d.push(Number.NaN, t)).not.toThrow();
    expect(() => d.push(1, Number.NaN)).not.toThrow();
  });
});
