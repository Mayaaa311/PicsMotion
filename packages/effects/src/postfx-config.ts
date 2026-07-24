import { clamp } from '@interactive-photo/shared';

/**
 * Declarative postprocessing configuration for a preset. Base values are the
 * resting look; the `*Audio`/`*Pointer` fields add motion- and music-reactive
 * amounts on top, always clamped by the matching `max*`.
 */
export interface PostFXConfig {
  enabled: boolean;
  // Bloom
  bloom: number;
  bloomThreshold: number;
  bloomAudio: number;
  maxBloom: number;
  // Vignette (edge darkening)
  vignette: number;
  // Film grain
  grain: number;
  // Chromatic aberration
  chromaticAberration: number;
  aberrationPointer: number;
  maxAberration: number;
  // Colour grade
  saturation: number; // -1..1
  brightness: number; // -1..1
  contrast: number; // -1..1
  sepia: number; // 0..1 (warmth)
  // Flashlight (Dark preset)
  flashlight: boolean;
  darken: number; // how dark the un-lit scene is, 0..1
  flashlightRadius: number; // fraction of the smaller viewport dimension
  flashlightFeather: number;
  // Spider-Verse comic stylization (Urban preset)
  spiderverse: boolean;
}

export const DEFAULT_POSTFX_CONFIG: PostFXConfig = {
  enabled: true,
  bloom: 0,
  bloomThreshold: 0.85,
  bloomAudio: 0,
  maxBloom: 2,
  vignette: 0.15,
  grain: 0.02,
  chromaticAberration: 0,
  aberrationPointer: 0,
  maxAberration: 0.01,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  sepia: 0,
  flashlight: false,
  darken: 0.82,
  flashlightRadius: 0.26,
  flashlightFeather: 0.28,
  spiderverse: false,
};

export interface PostFXInput {
  loudness: number;
  beatPulse: number;
  /** Normalized pointer speed, roughly 0..1+. */
  pointerSpeed: number;
  reducedMotion: boolean;
}

export interface ResolvedPostFX {
  bloom: number;
  bloomThreshold: number;
  vignette: number;
  grain: number;
  chromaticAberration: number;
  saturation: number;
  brightness: number;
  contrast: number;
  sepia: number;
  flashlight: boolean;
  darken: number;
  flashlightRadius: number;
  flashlightFeather: number;
  spiderverse: boolean;
}
// (ResolvedPostFX mirrors these effect fields.)

/**
 * Fold audio + pointer motion into the base config to get the effective
 * per-frame effect intensities. Pure and clamped, so it can be unit tested and
 * called every frame without allocating anything exotic. Reduced motion damps
 * only the *reactive additions*, never the resting look.
 */
export function resolvePostFX(config: PostFXConfig, input: PostFXInput): ResolvedPostFX {
  const reactive = input.reducedMotion ? 0.3 : 1;
  const loud = clamp(input.loudness, 0, 1);
  const beat = clamp(input.beatPulse, 0, 1);
  const speed = Math.max(input.pointerSpeed, 0);

  const bloom = clamp(
    config.bloom + (loud * config.bloomAudio + beat * config.bloomAudio * 0.5) * reactive,
    0,
    config.maxBloom,
  );
  const chromaticAberration = clamp(
    config.chromaticAberration + speed * config.aberrationPointer * reactive,
    0,
    config.maxAberration,
  );

  return {
    bloom,
    bloomThreshold: config.bloomThreshold,
    vignette: clamp(config.vignette, 0, 1),
    grain: clamp(config.grain, 0, 1),
    chromaticAberration,
    saturation: clamp(config.saturation, -1, 1),
    brightness: clamp(config.brightness, -1, 1),
    contrast: clamp(config.contrast, -1, 1),
    sepia: clamp(config.sepia, 0, 1),
    flashlight: config.flashlight,
    darken: clamp(config.darken, 0, 1),
    flashlightRadius: Math.max(config.flashlightRadius, 0.01),
    flashlightFeather: Math.max(config.flashlightFeather, 0.001),
    spiderverse: config.spiderverse,
  };
}
