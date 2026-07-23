import { describe, expect, it } from 'vitest';

import { getPreset, mergePreset, presets } from './index';

describe('presets', () => {
  it('defines all five presets with matching ids', () => {
    for (const [key, preset] of Object.entries(presets)) {
      expect(preset.id).toBe(key);
    }
    expect(Object.keys(presets)).toHaveLength(5);
  });
});

describe('mergePreset', () => {
  it('returns the base preset when no override is given', () => {
    expect(mergePreset('soft-nature')).toEqual(getPreset('soft-nature'));
  });

  it('shallow-merges nested groups without dropping sibling fields', () => {
    const merged = mergePreset('soft-nature', { pointer: { strength: 0.9 } });
    expect(merged.pointer.strength).toBe(0.9);
    // untouched sibling fields survive
    expect(merged.pointer.mode).toBe('soft-nature' === 'soft-nature' ? 'wind' : 'wind');
    expect(merged.pointer.radius).toBe(getPreset('soft-nature').pointer.radius);
  });

  it('replaces audioBindings array wholesale when provided', () => {
    const binding = {
      source: 'bass' as const,
      target: 'camera.zoom',
      scale: 1,
      offset: 0,
      smoothing: 0.2,
      clamp: [0, 1] as [number, number],
      curve: 'linear' as const,
    };
    const merged = mergePreset('urban', { audioBindings: [binding] });
    expect(merged.audioBindings).toEqual([binding]);
  });

  it('does not mutate the base preset', () => {
    const before = JSON.stringify(getPreset('electronic'));
    mergePreset('electronic', { camera: { shakeStrength: 999 } });
    expect(JSON.stringify(getPreset('electronic'))).toBe(before);
  });
});
