import type { QualityLevel } from '@interactive-photo/scene-schema';

/** Depth-related runtime constants. Documented so the numbers aren't "magic". */

/** World-space distance the camera sits in front of the stage (z=0 plane). */
export const CAMERA_DISTANCE = 6;

/** World-space z-spread between the nearest (depth 0) and farthest (depth 1) layer. */
export const DEPTH_SPREAD = 2.5;

/** Global multiplier applied on top of per-layer/per-preset parallax strength. */
export const GLOBAL_PARALLAX_SCALE = 0.6;

/** Particle count ceilings per quality tier (used by later milestones). */
export const PARTICLE_BUDGET: Record<QualityLevel, number> = {
  low: 120,
  medium: 350,
  high: 900,
};

/** Device-pixel-ratio ceilings per quality tier. */
export const DPR_CEILING: Record<QualityLevel, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};
