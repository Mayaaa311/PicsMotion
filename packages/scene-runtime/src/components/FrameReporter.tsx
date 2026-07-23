'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

import { useRuntime } from '../context';
import { useRuntimeStore } from '../store';

/**
 * Measures FPS and mirrors pointer/layer-depth info into the runtime store at a
 * low frequency (~5 Hz) so the DOM DebugPanel can render without touching the
 * per-frame hot path.
 */
export function FrameReporter() {
  const { scene, pointerRef, preset, getAudioFrame } = useRuntime();
  const frames = useRef(0);
  const acc = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    acc.current += delta;
    if (acc.current < 0.2) return;

    const fps = frames.current / acc.current;
    frames.current = 0;
    acc.current = 0;

    const p = pointerRef.current;
    const af = getAudioFrame();
    useRuntimeStore.getState().updateDebug({
      fps: Math.round(fps),
      pointerImageSpace: { x: +p.imageSpace.x.toFixed(3), y: +p.imageSpace.y.toFixed(3) },
      activePreset: preset.id,
      layerDepths: scene.layers.map((l) => ({ id: l.id, depth: l.depth })),
      drawCallHint: scene.layers.length,
      audio: af
        ? { bass: +af.bass.toFixed(2), loudness: +af.loudness.toFixed(2), beat: +af.beatPulse.toFixed(2) }
        : null,
    });
  });

  return null;
}
