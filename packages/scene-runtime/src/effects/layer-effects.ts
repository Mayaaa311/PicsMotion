import type { SceneLayer, ScenePreset } from '@interactive-photo/scene-schema';
import { clamp } from '@interactive-photo/shared';

/** Which material a layer should be drawn with. */
export type LayerMaterialKind = 'basic' | 'wind' | 'water' | 'paper';

export interface LayerEffectPlan {
  material: LayerMaterialKind;
  /**
   * Bend resistance for the wind shader (>= 1). Derived from the layer's
   * `importance` so the emotional centre of the photo stays steady while
   * decorative foreground foliage moves freely — a core product rule.
   */
  windStiffness: number;
  /** Whether pointer/beat ripples may be spawned on this layer. */
  rippleEnabled: boolean;
}

const WIND_TAGS = ['wind', 'sway'];

/**
 * Decide how a layer participates in the effect system, from its authored tags,
 * role and importance plus the active preset. Pure so it can be unit tested and
 * so no preset-specific branching leaks into the render components.
 *
 * Wind only applies under a wind-style pointer (Soft Nature); water ripples only
 * apply to layers explicitly tagged as water.
 */
export function planLayerEffects(layer: SceneLayer, preset: ScenePreset): LayerEffectPlan {
  const isWater = layer.materialTags.includes('water');
  const wantsWind = layer.interactionTags.some((t) => WIND_TAGS.includes(t));
  const windPointer = preset.pointer.mode === 'wind';
  // Nostalgic's "lift" pointer turns non-background layers into paper cutouts.
  const paperPointer = preset.pointer.mode === 'lift';

  let material: LayerMaterialKind = 'basic';
  if (isWater) material = 'water';
  else if (wantsWind && windPointer) material = 'wind';
  else if (paperPointer && layer.role !== 'background') material = 'paper';

  // importance 0 → very flexible (1), importance 1 → very stiff (5).
  const windStiffness = 1 + clamp(layer.importance, 0, 1) * 4;

  return {
    material,
    windStiffness,
    rippleEnabled: isWater && layer.interactionTags.includes('ripple'),
  };
}
