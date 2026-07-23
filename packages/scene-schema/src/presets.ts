import { z } from 'zod';

import { audioBindingSchema } from './audio';
import { presetNameSchema } from './scene';

export const pointerModeSchema = z.enum([
  'wind',
  'inertia',
  'flashlight',
  'repel',
  'lift',
]);
export type PointerMode = z.infer<typeof pointerModeSchema>;

export const presetPointerSchema = z.object({
  mode: pointerModeSchema,
  smoothing: z.number().min(0).max(1),
  radius: z.number().min(0),
  strength: z.number().min(0),
});

export const presetCameraSchema = z.object({
  parallaxStrength: z.number().min(0),
  zoomResponse: z.number().min(0),
  shakeStrength: z.number().min(0),
  driftStrength: z.number().min(0).default(0),
});

export const presetParticlesSchema = z.object({
  type: z.enum(['none', 'pollen', 'dust', 'sparks', 'fragments', 'paper']),
  count: z.number().int().min(0),
  speed: z.number().min(0),
});

export const presetPostprocessingSchema = z.object({
  bloom: z.number().min(0),
  vignette: z.number().min(0),
  noise: z.number().min(0),
  chromaticAberration: z.number().min(0),
  directionalBlur: z.number().min(0).default(0),
});

/** A serializable preset. Scenes may override individual properties. */
export const scenePresetSchema = z.object({
  id: presetNameSchema,
  displayName: z.string(),
  pointer: presetPointerSchema,
  camera: presetCameraSchema,
  particles: presetParticlesSchema,
  postprocessing: presetPostprocessingSchema,
  audioBindings: z.array(audioBindingSchema).default([]),
});
export type ScenePreset = z.infer<typeof scenePresetSchema>;

export type QualityLevel = 'low' | 'medium' | 'high';
export const qualityLevelSchema = z.enum(['low', 'medium', 'high']);
