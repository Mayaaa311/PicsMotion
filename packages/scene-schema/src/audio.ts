import { z } from 'zod';

/**
 * A single analysed audio frame. All band values are normalized to [0, 1] by the
 * audio engine before they reach the rendering layer. The scene runtime consumes
 * these values and must never query an AnalyserNode directly.
 */
export const audioFrameSchema = z.object({
  /** Playback time in seconds. */
  time: z.number(),
  bass: z.number().min(0).max(1),
  lowMid: z.number().min(0).max(1),
  highMid: z.number().min(0).max(1),
  treble: z.number().min(0).max(1),
  loudness: z.number().min(0).max(1),
  /** Rate of spectral change; useful for onset/beat detection. */
  spectralFlux: z.number().min(0),
  /** Decaying pulse triggered by detected beats, normalized to [0, 1]. */
  beatPulse: z.number().min(0).max(1),
});
export type AudioFrame = z.infer<typeof audioFrameSchema>;

export const audioBindingSourceSchema = z.enum([
  'bass',
  'lowMid',
  'highMid',
  'treble',
  'loudness',
  'beatPulse',
]);
export type AudioBindingSource = z.infer<typeof audioBindingSourceSchema>;

export const audioCurveSchema = z.enum(['linear', 'easeIn', 'easeOut', 'exponential']);
export type AudioCurve = z.infer<typeof audioCurveSchema>;

/**
 * Declarative mapping from a normalized audio source to a named target parameter.
 * `target` is a dot-path resolved by the preset/effect layer (e.g.
 * "camera.zoom" or "layer:grass.windStrength").
 */
export const audioBindingSchema = z.object({
  source: audioBindingSourceSchema,
  target: z.string().min(1),
  scale: z.number(),
  offset: z.number(),
  /** Exponential smoothing factor in [0, 1]; higher = snappier. */
  smoothing: z.number().min(0).max(1),
  clamp: z.tuple([z.number(), z.number()]),
  curve: audioCurveSchema.default('linear'),
});
export type AudioBinding = z.infer<typeof audioBindingSchema>;

/** A detected structural section of a track (intro, verse, drop, ...). */
export const audioSectionSchema = z.object({
  label: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
});
export type AudioSection = z.infer<typeof audioSectionSchema>;
