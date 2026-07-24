import type { ScenePreset } from '@interactive-photo/scene-schema';

/**
 * The five product presets as serializable configuration objects. These describe
 * *intent* (pointer behavior, camera response, particle style, postprocessing);
 * the runtime and effect modules read them rather than branching on preset name.
 *
 * Milestone 1 only consumes `pointer`, `camera`, and `particles.count`. The
 * remaining fields are wired by later milestones (audio, effects, physics).
 */

export const softNaturePreset: ScenePreset = {
  id: 'soft-nature',
  displayName: 'Soft Nature',
  pointer: { mode: 'wind', smoothing: 0.12, radius: 0.25, strength: 0.35 },
  camera: { parallaxStrength: 0.16, zoomResponse: 0.03, shakeStrength: 0, driftStrength: 0.02 },
  particles: { type: 'pollen', count: 350, speed: 0.08 },
  postprocessing: { bloom: 0.08, vignette: 0.05, noise: 0.01, chromaticAberration: 0, directionalBlur: 0 },
  audioBindings: [],
};

// Urban absorbs the former Electronic preset's energy and adds the comic
// "Spider-Verse" cursor stylization (see packages/effects/spiderverse).
export const urbanPreset: ScenePreset = {
  id: 'urban',
  displayName: 'Urban / Spider-Verse',
  pointer: { mode: 'inertia', smoothing: 0.08, radius: 0.4, strength: 0.6 },
  camera: { parallaxStrength: 0.22, zoomResponse: 0.14, shakeStrength: 0.08, driftStrength: 0 },
  particles: { type: 'sparks', count: 260, speed: 0.28 },
  postprocessing: { bloom: 0.18, vignette: 0.14, noise: 0.02, chromaticAberration: 0.03, directionalBlur: 0.3 },
  audioBindings: [],
};

export const darkPreset: ScenePreset = {
  id: 'dark',
  displayName: 'Dark / Mysterious',
  pointer: { mode: 'flashlight', smoothing: 0.1, radius: 0.28, strength: 0.4 },
  camera: { parallaxStrength: 0.1, zoomResponse: 0.02, shakeStrength: 0.02, driftStrength: 0.01 },
  particles: { type: 'dust', count: 200, speed: 0.05 },
  postprocessing: { bloom: 0.04, vignette: 0.45, noise: 0.03, chromaticAberration: 0, directionalBlur: 0 },
  audioBindings: [],
};

export const nostalgicPreset: ScenePreset = {
  id: 'nostalgic',
  displayName: 'Nostalgic / Folk',
  pointer: { mode: 'lift', smoothing: 0.1, radius: 0.35, strength: 0.3 },
  camera: { parallaxStrength: 0.12, zoomResponse: 0.02, shakeStrength: 0, driftStrength: 0.03 },
  particles: { type: 'dust', count: 150, speed: 0.04 },
  postprocessing: { bloom: 0.06, vignette: 0.2, noise: 0.06, chromaticAberration: 0, directionalBlur: 0 },
  audioBindings: [],
};

export const presets = {
  'soft-nature': softNaturePreset,
  urban: urbanPreset,
  dark: darkPreset,
  nostalgic: nostalgicPreset,
} as const;

export type PresetMap = typeof presets;
