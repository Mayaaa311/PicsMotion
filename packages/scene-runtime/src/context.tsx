'use client';

import type { PointerFieldState, ScenePreset, SceneDocument } from '@interactive-photo/scene-schema';
import { createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';

import type { SceneEventBus } from './events/eventBus';

export interface RuntimeContextValue {
  scene: SceneDocument;
  preset: ScenePreset;
  /** Mutable pointer state, updated imperatively (never triggers rerenders). */
  pointerRef: MutableRefObject<PointerFieldState>;
  bus: SceneEventBus;
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
