'use client';

import type { StylePaintField } from '@interactive-photo/effects';
import type {
  AudioFrame,
  PointerFieldState,
  ScenePreset,
  SceneDocument,
} from '@interactive-photo/scene-schema';
import { createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';

import type { SceneEventBus } from './events/eventBus';

/** Imperative accessor for the latest audio frame; returns null when no audio. */
export type AudioFrameAccessor = () => AudioFrame | null;

export interface RuntimeContextValue {
  scene: SceneDocument;
  preset: ScenePreset;
  /** Mutable pointer state, updated imperatively (never triggers rerenders). */
  pointerRef: MutableRefObject<PointerFieldState>;
  bus: SceneEventBus;
  /** Optional: read the current normalized audio frame (never an AnalyserNode). */
  getAudioFrame: AudioFrameAccessor;
  /**
   * Shared cursor "paint" field (picture-UV; per-pixel strength + style id),
   * owned by {@link PaintField} and sampled by each layer's styled overlay to
   * reveal each stroke's own AI art style where painted. Null until engaged.
   */
  paintFieldRef: MutableRefObject<StylePaintField | null>;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export const RuntimeProvider = RuntimeContext.Provider;

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error('useRuntime must be used within <InteractiveScene>');
  }
  return ctx;
}
