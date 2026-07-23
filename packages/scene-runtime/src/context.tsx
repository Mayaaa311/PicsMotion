'use client';

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
