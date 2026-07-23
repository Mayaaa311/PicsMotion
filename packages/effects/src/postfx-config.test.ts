import { describe, expect, it } from 'vitest';

import { DEFAULT_POSTFX_CONFIG, resolvePostFX, type PostFXConfig } from './postfx-config';

const cfg = (over: Partial<PostFXConfig> = {}): PostFXConfig => ({ ...DEFAULT_POSTFX_CONFIG, ...over });
const input = (over = {}) => ({ loudness: 0, beatPulse: 0, pointerSpeed: 0, reducedMotion: false, ...over });

describe('resolvePostFX', () => {
  it('returns base values with no audio/pointer', () => {
    const r = resolvePostFX(cfg({ bloom: 0.1, vignette: 0.2, grain: 0.03 }), input());
    expect(r.bloom).toBeCloseTo(0.1, 6);
    expect(r.vignette).toBeCloseTo(0.2, 6);
    expect(r.grain).toBeCloseTo(0.03, 6);
  });

  it('adds loudness-driven bloom, clamped by maxBloom', () => {
    const r = resolvePostFX(cfg({ bloom: 0.2, bloomAudio: 1, maxBloom: 0.5 }), input({ loudness: 1 }));
    expect(r.bloom).toBe(0.5);
  });

  it('adds pointer-driven chromatic aberration, clamped', () => {
    const r = resolvePostFX(
      cfg({ chromaticAberration: 0, aberrationPointer: 0.02, maxAberration: 0.01 }),
      input({ pointerSpeed: 5 }),
    );
    expect(r.chromaticAberration).toBe(0.01);
  });

  it('reduced motion damps reactive additions but not the base look', () => {
    const base = cfg({ bloom: 0.1, bloomAudio: 1, vignette: 0.3 });
    const normal = resolvePostFX(base, input({ loudness: 1 }));
    const reduced = resolvePostFX(base, input({ loudness: 1, reducedMotion: true }));
    expect(reduced.bloom).toBeLessThan(normal.bloom);
    expect(reduced.bloom).toBeGreaterThan(0.1); // base still present
    expect(reduced.vignette).toBe(normal.vignette); // resting look unchanged
  });

  it('clamps colour-grade fields to their ranges', () => {
    const r = resolvePostFX(cfg({ saturation: -5, brightness: 5, sepia: 9 }), input());
    expect(r.saturation).toBe(-1);
    expect(r.brightness).toBe(1);
    expect(r.sepia).toBe(1);
  });

  it('passes flashlight settings through with safe minimums', () => {
    const r = resolvePostFX(cfg({ flashlight: true, flashlightRadius: 0, flashlightFeather: 0 }), input());
    expect(r.flashlight).toBe(true);
    expect(r.flashlightRadius).toBeGreaterThan(0);
    expect(r.flashlightFeather).toBeGreaterThan(0);
  });
});
