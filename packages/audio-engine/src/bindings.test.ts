import type { AudioBinding, AudioFrame } from '@interactive-photo/scene-schema';
import { describe, expect, it } from 'vitest';

import { evaluateBinding, evaluateBindings } from './bindings';

const frame: AudioFrame = {
  time: 12.5,
  bass: 0.5,
  lowMid: 0.25,
  highMid: 0.1,
  treble: 0.9,
  loudness: 0.4,
  spectralFlux: 0.3,
  beatPulse: 1,
};

function binding(over: Partial<AudioBinding> = {}): AudioBinding {
  return {
    source: 'bass',
    target: 'camera.zoom',
    scale: 1,
    offset: 0,
    smoothing: 0.2,
    clamp: [0, 1],
    curve: 'linear',
    ...over,
  };
}

describe('evaluateBinding', () => {
  it('reads the named source band', () => {
    expect(evaluateBinding(binding({ source: 'bass' }), frame)).toBeCloseTo(0.5, 5);
    expect(evaluateBinding(binding({ source: 'beatPulse' }), frame)).toBeCloseTo(1, 5);
  });

  it('applies scale then offset', () => {
    expect(
      evaluateBinding(binding({ source: 'lowMid', scale: 4, offset: 0.5, clamp: [0, 10] }), frame),
    ).toBeCloseTo(1.5, 5);
  });

  it('clamps to the configured range', () => {
    expect(evaluateBinding(binding({ source: 'treble', scale: 10, clamp: [0, 2] }), frame)).toBe(2);
    expect(
      evaluateBinding(binding({ source: 'bass', scale: -10, clamp: [-1, 1] }), frame),
    ).toBe(-1);
  });

  it('shapes the value with the easing curve', () => {
    const lin = evaluateBinding(binding({ source: 'loudness', curve: 'linear', clamp: [0, 2] }), frame);
    const easeIn = evaluateBinding(binding({ source: 'loudness', curve: 'easeIn', clamp: [0, 2] }), frame);
    const easeOut = evaluateBinding(binding({ source: 'loudness', curve: 'easeOut', clamp: [0, 2] }), frame);
    expect(easeIn).toBeLessThan(lin); // x^2 at 0.4
    expect(easeOut).toBeGreaterThan(lin);
  });
});

describe('evaluateBindings', () => {
  it('keys each result by its target', () => {
    const out = evaluateBindings(
      [
        binding({ target: 'camera.zoom', source: 'bass' }),
        binding({ target: 'fog.density', source: 'lowMid' }),
      ],
      frame,
    );
    expect(Object.keys(out).sort()).toEqual(['camera.zoom', 'fog.density']);
    expect(out['camera.zoom']).toBeCloseTo(0.5, 5);
    expect(out['fog.density']).toBeCloseTo(0.25, 5);
  });

  it('returns an empty map for no bindings', () => {
    expect(evaluateBindings([], frame)).toEqual({});
  });
});
