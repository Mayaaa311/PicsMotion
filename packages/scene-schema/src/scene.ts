import { z } from 'zod';

import { audioBindingSchema } from './audio';

export const SCENE_SCHEMA_VERSION = '1.0' as const;

export const presetNameSchema = z.enum([
  'soft-nature',
  'urban',
  'dark',
  'electronic',
  'nostalgic',
]);
export type PresetName = z.infer<typeof presetNameSchema>;

export const layerRoleSchema = z.enum([
  'background',
  'distant',
  'midground',
  'secondary-subject',
  'primary-subject',
  'foreground',
  'atmosphere',
]);
export type LayerRole = z.infer<typeof layerRoleSchema>;

export const returnModeSchema = z.enum(['spring', 'inertia', 'physics', 'fixed']);
export type ReturnMode = z.infer<typeof returnModeSchema>;

/** Normalized [0,1] rectangle in image space (origin top-left). */
export const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Bounds = z.infer<typeof boundsSchema>;

export const anchorSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const layerMovementSchema = z.object({
  enabled: z.boolean(),
  maxOffsetX: z.number().min(0),
  maxOffsetY: z.number().min(0),
  maxOffsetZ: z.number().min(0),
  maxRotation: z.number().min(0),
  parallaxStrength: z.number().min(0),
  dragEnabled: z.boolean(),
  returnMode: returnModeSchema,
});
export type LayerMovement = z.infer<typeof layerMovementSchema>;

export const audioSensitivitySchema = z.object({
  bass: z.number().min(0).max(1),
  lowMid: z.number().min(0).max(1),
  highMid: z.number().min(0).max(1),
  treble: z.number().min(0).max(1),
  beat: z.number().min(0).max(1),
  loudness: z.number().min(0).max(1),
});
export type AudioSensitivity = z.infer<typeof audioSensitivitySchema>;

/** Limits on how far a layer may move, so we never reveal unreconstructed pixels. */
export const revealBudgetSchema = z.object({
  maxOffsetX: z.number().min(0),
  maxOffsetY: z.number().min(0),
  confidence: z.number().min(0).max(1),
  generatedCoverageMaskUrl: z.string().optional(),
});
export type RevealBudget = z.infer<typeof revealBudgetSchema>;

export const provenanceSchema = z.object({
  visiblePixels: z.enum(['original', 'generated', 'mixed']),
  sourceImageHash: z.string(),
  segmentationProvider: z.string().optional(),
  mattingProvider: z.string().optional(),
  completionProvider: z.string().optional(),
  providerRequestIds: z.array(z.string()).optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const sceneLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  semanticLabel: z.string(),
  role: layerRoleSchema,

  assetUrl: z.string().min(1),
  maskUrl: z.string().optional(),
  alphaAssetUrl: z.string().optional(),

  bounds: boundsSchema,
  anchor: anchorSchema,

  /** Relative depth in [0,1]; 0 = nearest camera, 1 = farthest. */
  depth: z.number().min(0).max(1),
  depthVariance: z.number().min(0),
  baseScale: z.number().positive(),
  baseRotation: z.number(),
  baseOpacity: z.number().min(0).max(1),

  movement: layerMovementSchema,

  interactionTags: z.array(z.string()),
  materialTags: z.array(z.string()),
  audioSensitivity: audioSensitivitySchema,

  importance: z.number().min(0).max(1),
  locked: z.boolean(),

  revealBudget: revealBudgetSchema,
  provenance: provenanceSchema,
});
export type SceneLayer = z.infer<typeof sceneLayerSchema>;

export const visualAnalysisSchema = z.object({
  sceneType: z.string(),
  mainSubject: z.string(),
  secondarySubjects: z.array(z.string()).default([]),
  foregroundCandidates: z.array(z.string()).default([]),
  midgroundCandidates: z.array(z.string()).default([]),
  background: z.string().default(''),
  waterRegions: z.array(z.string()).default([]),
  vegetationRegions: z.array(z.string()).default([]),
  skyRegions: z.array(z.string()).default([]),
  transparentOrReflectiveRegions: z.array(z.string()).default([]),
  lightingDirection: z.string().default(''),
  depthOfField: z.string().default(''),
  cameraStyle: z.string().default(''),
  dominantColors: z.array(z.string()).default([]),
  mood: z.string().default(''),
  suggestedPreset: presetNameSchema.optional(),
  suggestedMotionTags: z.array(z.string()).default([]),
  suggestedSegmentationPrompts: z.array(z.string()).default([]),
  lockedObjects: z.array(z.string()).default([]),
  expectedSegmentationDifficulty: z.enum(['low', 'medium', 'high']).default('medium'),
  inpaintingRiskAreas: z.array(z.string()).default([]),
});
export type VisualAnalysis = z.infer<typeof visualAnalysisSchema>;

export const atmosphereConfigSchema = z.object({
  fog: z
    .object({
      enabled: z.boolean().default(false),
      density: z.number().min(0).max(1).default(0),
      color: z.string().default('#ffffff'),
      layers: z.number().int().min(0).max(5).default(0),
    })
    .default({}),
  ambientLight: z.number().min(0).max(2).default(1),
  vignette: z.number().min(0).max(1).default(0),
  grain: z.number().min(0).max(1).default(0),
});
export type AtmosphereConfig = z.infer<typeof atmosphereConfigSchema>;

export const cameraConfigSchema = z.object({
  /** Field of view in degrees for the perspective camera. */
  fov: z.number().min(1).max(179).default(45),
  parallaxStrength: z.number().min(0).default(0.16),
  zoomResponse: z.number().min(0).default(0.03),
  shakeStrength: z.number().min(0).default(0),
  driftStrength: z.number().min(0).default(0),
});
export type CameraConfig = z.infer<typeof cameraConfigSchema>;

export const sceneMetadataSchema = z.object({
  createdAt: z.string(),
  pipelineVersion: z.string(),
});

export const sceneDocumentSchema = z
  .object({
    version: z.literal(SCENE_SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.number().positive(),
    originalImageUrl: z.string().min(1),
    backgroundPlateUrl: z.string().min(1),
    depthMapUrl: z.string().optional(),
    preset: presetNameSchema,
    visualAnalysis: visualAnalysisSchema,
    layers: z.array(sceneLayerSchema).min(1),
    atmosphere: atmosphereConfigSchema,
    camera: cameraConfigSchema,
    audioBindings: z.array(audioBindingSchema).default([]),
    metadata: sceneMetadataSchema,
  })
  .superRefine((doc, ctx) => {
    // Aspect ratio must be internally consistent (within rounding tolerance).
    const expected = doc.width / doc.height;
    if (Math.abs(expected - doc.aspectRatio) > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aspectRatio'],
        message: `aspectRatio ${doc.aspectRatio} does not match width/height (${expected.toFixed(3)})`,
      });
    }
    // Layer ids must be unique.
    const ids = new Set<string>();
    for (const layer of doc.layers) {
      if (ids.has(layer.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layers'],
          message: `duplicate layer id: ${layer.id}`,
        });
      }
      ids.add(layer.id);
    }
  });
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;

/**
 * Parse and validate an unknown value as a SceneDocument. Throws a ZodError with
 * readable messages on failure.
 */
export function parseSceneDocument(input: unknown): SceneDocument {
  return sceneDocumentSchema.parse(input);
}

/** Non-throwing variant returning a discriminated result. */
export function safeParseSceneDocument(input: unknown) {
  return sceneDocumentSchema.safeParse(input);
}
