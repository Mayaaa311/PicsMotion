'use client';

import { PostFX } from '@interactive-photo/effects';
import type { PresetOverride } from '@interactive-photo/presets';
import { getPresetEffects, mergePreset } from '@interactive-photo/presets';
import type { SceneDocument } from '@interactive-photo/scene-schema';
import { DPR_CEILING } from '@interactive-photo/shared';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';

import type { AudioFrameAccessor } from '../context';
import { RuntimeProvider } from '../context';
import { SceneEventBus } from '../events/eventBus';
import { usePointerField } from '../hooks/usePointerField';
import { useSyncReducedMotion } from '../hooks/useReducedMotion';
import { useRuntimeStore } from '../store';
import { AudioCameraController } from './AudioCameraController';
import { DebugPanel } from './DebugPanel';
import { FrameReporter } from './FrameReporter';
import { LoadingOverlay } from './LoadingOverlay';
import { SceneCamera } from './SceneCamera';
import { SceneContent } from './SceneContent';

const NO_AUDIO: AudioFrameAccessor = () => null;

export interface InteractiveSceneProps {
  scene: SceneDocument;
  /** Scene-level overrides applied on top of the preset named in `scene.preset`. */
  presetOverride?: PresetOverride;
  /** Prefix prepended to each layer's `assetUrl` (e.g. a scene folder path). */
  assetBaseUrl?: string;
  /** Show the diagnostics overlay (FPS, pointer, layers, quality controls). */
  showDebug?: boolean;
  /** Optional accessor for the latest normalized audio frame (Milestone 2). */
  getAudioFrame?: AudioFrameAccessor;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * The reusable scene runtime. Renders a validated {@link SceneDocument} as an
 * interactive 2.5D canvas: contain-fit layers, depth-aware clamped parallax,
 * loading progress, quality/DPR control, reduced-motion support, and a pause on
 * page hide. One engine, configured by a preset — never a per-preset fork.
 */
export function InteractiveScene({
  scene,
  presetOverride,
  assetBaseUrl = '',
  showDebug = false,
  getAudioFrame = NO_AUDIO,
  className,
  style,
  children,
}: InteractiveSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const preset = useMemo(() => mergePreset(scene.preset, presetOverride), [scene.preset, presetOverride]);
  const pointerRef = usePointerField(containerRef, preset.pointer.smoothing);
  const bus = useMemo(() => new SceneEventBus(), []);

  const quality = useRuntimeStore((s) => s.quality);
  const reducedMotion = useRuntimeStore((s) => s.reducedMotion);
  const setPaused = useRuntimeStore((s) => s.setPaused);
  useSyncReducedMotion();

  const postConfig = useMemo(() => getPresetEffects(preset.id).post, [preset.id]);
  const getPointer = useCallback(
    () => ({
      x: pointerRef.current.imageSpace.x,
      y: pointerRef.current.imageSpace.y,
      speed: pointerRef.current.speed,
    }),
    [pointerRef],
  );

  // Pause rendering while the tab/page is hidden (performance + battery).
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setPaused]);

  const ctx = useMemo(
    () => ({ scene, preset, pointerRef, bus, getAudioFrame }),
    [scene, preset, pointerRef, bus, getAudioFrame],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', ...style }}
      data-testid="interactive-scene"
    >
      <Canvas
        dpr={[1, DPR_CEILING[quality]]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        // `frameloop="always"` for M1; later milestones can switch to "demand".
      >
        <RuntimeProvider value={ctx}>
          <SceneCamera />
          <Suspense fallback={null}>
            <SceneContent assetBaseUrl={assetBaseUrl} />
          </Suspense>
          <AudioCameraController />
          <FrameReporter />
          {postConfig?.enabled !== false && (
            <PostFX
              config={postConfig}
              getAudioFrame={getAudioFrame}
              getPointer={getPointer}
              reducedMotion={reducedMotion}
            />
          )}
        </RuntimeProvider>
      </Canvas>

      <LoadingOverlay />
      {showDebug && <DebugPanel />}
      {children}
    </div>
  );
}
