import type { PresetName, ScenePreset } from '@interactive-photo/scene-schema';

import { presets } from './definitions';

/**
 * Override helper for preset tweaks carried on a scene. Nested config groups are
 * shallow-partial; arrays and scalars are replaced wholesale (not partial-ified).
 */
export type PresetOverride = {
  [K in keyof ScenePreset]?: ScenePreset[K] extends readonly unknown[]
    ? ScenePreset[K]
    : ScenePreset[K] extends object
      ? Partial<ScenePreset[K]>
      : ScenePreset[K];
};

/** Return the base preset for a name. */
export function getPreset(name: PresetName): ScenePreset {
  return presets[name];
}

/**
 * Merge a scene-level override on top of a base preset. One level of nested
 * objects is merged shallowly (pointer, camera, particles, postprocessing);
 * arrays and scalars are replaced. This keeps preset-specific logic out of the
 * runtime — a scene tweaks values, it does not fork behavior.
 */
export function mergePreset(name: PresetName, override?: PresetOverride): ScenePreset {
  const base = presets[name];
  if (!override) return base;

  const merged: ScenePreset = {
    ...base,
    pointer: { ...base.pointer, ...(override.pointer ?? {}) },
    camera: { ...base.camera, ...(override.camera ?? {}) },
    particles: { ...base.particles, ...(override.particles ?? {}) },
    postprocessing: { ...base.postprocessing, ...(override.postprocessing ?? {}) },
    audioBindings: override.audioBindings ?? base.audioBindings,
  };

  if (override.displayName !== undefined) merged.displayName = override.displayName;
  return merged;
}
