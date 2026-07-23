import type { AudioBinding, AudioFrame } from '@interactive-photo/scene-schema';
import { describe, expect, it } from 'vitest';

import { applyAudioBindings, evaluateBinding } from './bindings';

const frame: AudioFrame = {
  time: 0,
  bass: 0.5,
  lowMid: 0.2,
  highMid: 0.1,
  treble: 0.8,
  loudness: 0.4,
  spectralFlux: 0.3,
  beatPulse: 1,
};

function binding(over: Partial<AudioBinding>): AudioBinding {
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
  it('reads the source band and applies scale + offset', () => {
    // clamp widened so this asserts the arithmetic, not the clamp
    expect(
      evaluateBinding(binding({ source: 'bass', scale: 2, offset: 0.1, clamp: [0, 5] }), frame),
    ).toBeCloseTo(1.1, 5);
  });

  it('clamps to the configured range', () => {
    expect(evaluateBinding(binding({ source: 'treble', scale: 5, clamp: [0, 1] }), frame)).toBe(1);
  });

  it('applies the easing curve to the normalized source', () => {
    const linear = evaluateBinding(binding({ source: 'loudness', curve: 'linear', clamp: [0, 1] }), frame);
    const easeIn = evaluateBinding(binding({ source: 'loudness', curve: 'easeIn', clamp: [0, 1] }), frame);
    // easeIn (x^2) of 0.4 < linear 0.4
    expect(easeIn).toBeLessThan(linear);
  });
});

describe('applyAudioBindings', () => {
  it('keys results by target', () => {
    const map = applyAudioBindings(
      [
        binding({ target: 'camera.zoom', source: 'bass' }),
        binding({ target: 'camera.push', source: 'beatPulse' }),
      ],
      frame,
    );
    expect(map['camera.zoom']).toBeCloseTo(0.5, 5);
    expect(map['camera.push']).toBeCloseTo(1, 5);
  });
});
