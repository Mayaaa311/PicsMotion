'use client';

import { useEffect, useRef, useState } from 'react';

import { AudioEngine, type AudioEngineOptions } from './audio-engine';

/**
 * Creates an {@link AudioEngine} for the lifetime of the component and disposes
 * it on unmount. Analysis values are intentionally NOT stored in React state —
 * read them imperatively via `engine.getFrame()` inside your own frame loop.
 */
export function useAudioEngine(options?: AudioEngineOptions): { engine: AudioEngine | null } {
  const optionsRef = useRef(options);
  const [engine, setEngine] = useState<AudioEngine | null>(null);

  useEffect(() => {
    const instance = new AudioEngine(optionsRef.current);
    setEngine(instance);
    return () => {
      instance.dispose();
      setEngine(null);
    };
  }, []);

  return { engine };
}
