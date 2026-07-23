import { getPreset } from '@interactive-photo/presets';
import type { SceneLayer } from '@interactive-photo/scene-schema';
import { describe, expect, it } from 'vitest';

import { planLayerEffects } from './layer-effects';

function layer(over: Partial<SceneLayer> = {}): SceneLayer {
  return {
    id: 'l',
    name: 'L',
    semanticLabel: 'l',
    role: 'midground',
    assetUrl: 'a.png',
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    anchor: { x: 0.5, y: 0.5 },
    depth: 0.5,
    depthVariance: 0,
    baseScale: 1,
    baseRotation: 0,
    baseOpacity: 1,
    movement: {
      enabled: true,
      maxOffsetX: 0.02,
      maxOffsetY: 0.02,
      maxOffsetZ: 0,
      maxRotation: 0,
      parallaxStrength: 0.2,
      dragEnabled: false,
      returnMode: 'spring',
    },
    interactionTags: [],
    materialTags: [],
    audioSensitivity: { bass: 0, lowMid: 0, highMid: 0, treble: 0, beat: 0, loudness: 0 },
    importance: 0.5,
    locked: false,
    revealBudget: { maxOffsetX: 0.02, maxOffsetY: 0.02, confidence: 1 },
    provenance: { visiblePixels: 'original', sourceImageHash: 'h' },
    ...over,
  };
}

const softNature = getPreset('soft-nature');
const urban = getPreset('urban');

describe('planLayerEffects', () => {
  it('uses the wind material for wind-tagged layers under a wind pointer', () => {
    const plan = planLayerEffects(layer({ interactionTags: ['wind', 'sway'] }), softNature);
    expect(plan.material).toBe('wind');
  });

  it('does not apply wind under a non-wind preset', () => {
    const plan = planLayerEffects(layer({ interactionTags: ['wind'] }), urban);
    expect(plan.material).toBe('basic');
  });

  it('uses the water material for water-tagged layers', () => {
    const plan = planLayerEffects(
      layer({ materialTags: ['water'], interactionTags: ['ripple', 'water'] }),
      softNature,
    );
    expect(plan.material).toBe('water');
    expect(plan.rippleEnabled).toBe(true);
  });

  it('water wins over wind when a layer is tagged both', () => {
    const plan = planLayerEffects(
      layer({ materialTags: ['water'], interactionTags: ['wind'] }),
      softNature,
    );
    expect(plan.material).toBe('water');
  });

  it('leaves untagged layers (sky, fog) on the basic material', () => {
    expect(planLayerEffects(layer(), softNature).material).toBe('basic');
    expect(planLayerEffects(layer({ interactionTags: ['drift'] }), softNature).material).toBe(
      'basic',
    );
  });

  it('makes the primary subject stiffer than foreground decoration', () => {
    const subject = planLayerEffects(
      layer({ role: 'primary-subject', importance: 1, interactionTags: ['sway'] }),
      softNature,
    );
    const foreground = planLayerEffects(
      layer({ role: 'foreground', importance: 0.5, interactionTags: ['wind'] }),
      softNature,
    );
    expect(subject.windStiffness).toBeGreaterThan(foreground.windStiffness);
    expect(subject.windStiffness).toBeGreaterThanOrEqual(1);
  });

  it('requires the ripple tag for ripples, not just a water material', () => {
    const plan = planLayerEffects(layer({ materialTags: ['water'] }), softNature);
    expect(plan.material).toBe('water');
    expect(plan.rippleEnabled).toBe(false);
  });
});
