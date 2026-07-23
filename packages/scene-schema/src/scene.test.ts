import { describe, expect, it } from 'vitest';

import {
  parseSceneDocument,
  safeParseSceneDocument,
  sceneLayerSchema,
  type SceneDocument,
} from './scene';

function makeLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'layer-1',
    name: 'Sky',
    semanticLabel: 'sky',
    role: 'background',
    assetUrl: '/scene/layers/sky.webp',
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    anchor: { x: 0.5, y: 0.5 },
    depth: 1,
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
      parallaxStrength: 0.05,
      dragEnabled: false,
      returnMode: 'spring',
    },
    interactionTags: [],
    materialTags: ['sky'],
    audioSensitivity: { bass: 0, lowMid: 0, highMid: 0, treble: 0, beat: 0, loudness: 0.1 },
    importance: 0.2,
    locked: true,
    revealBudget: { maxOffsetX: 0, maxOffsetY: 0, confidence: 1 },
    provenance: { visiblePixels: 'original', sourceImageHash: 'abc123' },
    ...overrides,
  };
}

function makeScene(overrides: Partial<Record<keyof SceneDocument, unknown>> = {}) {
  return {
    version: '1.0',
    id: 'scene-1',
    title: 'Test Scene',
    width: 1600,
    height: 900,
    aspectRatio: 1600 / 900,
    originalImageUrl: '/scene/original/normalized.webp',
    backgroundPlateUrl: '/scene/background.webp',
    preset: 'soft-nature',
    visualAnalysis: { sceneType: 'landscape', mainSubject: 'tree' },
    layers: [makeLayer()],
    atmosphere: {},
    camera: {},
    audioBindings: [],
    metadata: { createdAt: '2026-07-22T00:00:00Z', pipelineVersion: '0.1.0' },
    ...overrides,
  };
}

describe('sceneDocumentSchema', () => {
  it('accepts a well-formed scene and applies defaults', () => {
    const scene = parseSceneDocument(makeScene());
    expect(scene.preset).toBe('soft-nature');
    expect(scene.layers).toHaveLength(1);
    // atmosphere defaults populated
    expect(scene.atmosphere.ambientLight).toBe(1);
    expect(scene.camera.fov).toBe(45);
    // visualAnalysis array defaults populated
    expect(scene.visualAnalysis.secondarySubjects).toEqual([]);
  });

  it('rejects an unknown preset with a readable error', () => {
    const result = safeParseSceneDocument(makeScene({ preset: 'vaporwave' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('preset'))).toBe(true);
    }
  });

  it('requires at least one layer', () => {
    const result = safeParseSceneDocument(makeScene({ layers: [] }));
    expect(result.success).toBe(false);
  });

  it('flags an inconsistent aspectRatio', () => {
    const result = safeParseSceneDocument(makeScene({ aspectRatio: 0.5 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('aspectRatio'))).toBe(true);
    }
  });

  it('detects duplicate layer ids', () => {
    const result = safeParseSceneDocument(
      makeScene({ layers: [makeLayer(), makeLayer()] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate layer id'))).toBe(true);
    }
  });

  it('rejects the wrong schema version (migration boundary)', () => {
    const result = safeParseSceneDocument(makeScene({ version: '0.9' }));
    expect(result.success).toBe(false);
  });

  it('clamps-validates normalized ranges (depth in [0,1])', () => {
    const result = sceneLayerSchema.safeParse(makeLayer({ depth: 1.5 }));
    expect(result.success).toBe(false);
  });
});
