import { clamp, DEPTH_SPREAD, GLOBAL_PARALLAX_SCALE } from '@interactive-photo/shared';
import type { SceneLayer } from '@interactive-photo/scene-schema';

export interface Size {
  width: number;
  height: number;
}
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Visible world-space rectangle at the stage plane (z=0) for a perspective camera
 * looking down -Z from `distance`, with vertical `fovDeg` and a viewport aspect.
 */
export function visibleWorldSize(fovDeg: number, distance: number, viewportAspect: number): Size {
  const height = 2 * Math.tan((fovDeg * Math.PI) / 360) * distance;
  return { width: height * viewportAspect, height };
}

/**
 * Size the stage so the whole image is always contained in the viewport
 * ("contain" fit). This keeps composition stable across portrait/landscape and
 * any screen size — the image never crops.
 */
export function computeStageSize(imageAspect: number, visible: Size): Size {
  const visibleAspect = visible.width / visible.height;
  if (imageAspect > visibleAspect) {
    // Image is relatively wider than the viewport → fit by width.
    const width = visible.width;
    return { width, height: width / imageAspect };
  }
  // Fit by height.
  const height = visible.height;
  return { width: height * imageAspect, height };
}

/** World-space center of a layer given its normalized image-space bounds. */
export function layerCenterWorld(layer: Pick<SceneLayer, 'bounds'>, stage: Size): Vec2 {
  const cx = layer.bounds.x + layer.bounds.width / 2;
  const cy = layer.bounds.y + layer.bounds.height / 2;
  return {
    x: (cx - 0.5) * stage.width,
    // Image y grows downward; world y grows upward.
    y: (0.5 - cy) * stage.height,
  };
}

/** World-space size of a layer plane. */
export function layerPlaneSize(layer: Pick<SceneLayer, 'bounds'>, stage: Size): Size {
  return {
    width: layer.bounds.width * stage.width,
    height: layer.bounds.height * stage.height,
  };
}

/** World-space z of a layer from its normalized depth (0 near, 1 far). */
export function layerDepthZ(depth: number): number {
  const z = -depth * DEPTH_SPREAD;
  return z === 0 ? 0 : z; // normalize -0 → 0
}

/**
 * Depth-aware, clamped parallax offset for a layer, in world units.
 *
 * `pointerCentered` is in [-1,1] on each axis (0 = screen center). Offset is
 * bounded by BOTH the layer's authored `movement.maxOffset*` and its
 * `revealBudget.maxOffset*` (fractions of the image), so we never shift a layer
 * far enough to expose unreconstructed pixels. Under reduced motion the whole
 * effect is attenuated.
 */
export function parallaxOffsetWorld(
  pointerCentered: Vec2,
  layer: Pick<SceneLayer, 'movement' | 'revealBudget'>,
  stage: Size,
  presetParallax: number,
  reducedMotion: boolean,
): Vec2 {
  if (!layer.movement.enabled) return { x: 0, y: 0 };

  const attenuation = reducedMotion ? 0.3 : 1;
  const strength = layer.movement.parallaxStrength * presetParallax * GLOBAL_PARALLAX_SCALE * attenuation;

  const maxFracX = Math.min(layer.movement.maxOffsetX, layer.revealBudget.maxOffsetX || Infinity);
  const maxFracY = Math.min(layer.movement.maxOffsetY, layer.revealBudget.maxOffsetY || Infinity);

  const fracX = clamp(pointerCentered.x * strength, -maxFracX, maxFracX);
  const fracY = clamp(pointerCentered.y * strength, -maxFracY, maxFracY);

  return { x: fracX * stage.width, y: fracY * stage.height };
}
