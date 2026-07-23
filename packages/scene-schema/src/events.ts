import { z } from 'zod';

import { audioFrameSchema, audioSectionSchema } from './audio';
import { presetNameSchema } from './scene';

/** Plain vector types — scene-schema stays free of any Three.js dependency. */
export interface Vector2 {
  x: number;
  y: number;
}
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export const vector2Schema = z.object({ x: z.number(), y: z.number() });
export const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

/**
 * Typed events flowing through the scene runtime's internal event bus. Kept as a
 * discriminated union so consumers exhaustively handle each case.
 */
export const sceneEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pointer-move'), position: vector2Schema, velocity: vector2Schema }),
  z.object({ type: z.literal('drag-start'), layerId: z.string() }),
  z.object({ type: z.literal('drag-move'), layerId: z.string(), offset: vector3Schema }),
  z.object({ type: z.literal('drag-end'), layerId: z.string(), velocity: vector2Schema }),
  z.object({ type: z.literal('beat'), strength: z.number(), timestamp: z.number() }),
  z.object({ type: z.literal('audio-frame'), frame: audioFrameSchema }),
  z.object({ type: z.literal('section-change'), section: audioSectionSchema }),
  z.object({ type: z.literal('preset-change'), preset: presetNameSchema }),
]);
export type SceneEvent = z.infer<typeof sceneEventSchema>;

export type SceneEventType = SceneEvent['type'];

/** Snapshot of the pointer field, updated per frame via refs (not React state). */
export interface PointerFieldState {
  normalized: { x: number; y: number };
  imageSpace: { x: number; y: number };
  velocity: { x: number; y: number };
  speed: number;
  acceleration: number;
  isDown: boolean;
  lastInteractionTime: number;
}

export function createInitialPointerFieldState(): PointerFieldState {
  return {
    normalized: { x: 0.5, y: 0.5 },
    imageSpace: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    acceleration: 0,
    isDown: false,
    lastInteractionTime: 0,
  };
}
