'use client';

import { CursorHalo, FogPlanes, ParticleField, SunlightGlow } from '@interactive-photo/effects';
import { getPresetEffects } from '@interactive-photo/presets';
import { CAMERA_DISTANCE } from '@interactive-photo/shared';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';

import { useRuntime } from '../context';
import { computeStageSize, visibleWorldSize } from '../math/coordinates';
import { useRuntimeStore } from '../store';
import { LayerPlane } from './LayerPlane';
import { PaintField } from './PaintField';

interface SceneContentProps {
  assetBaseUrl: string;
  /** Plain mode: layers + paintbrush only, no ambient effects (fog/particles/…). */
  plain?: boolean;
}

/**
 * Computes the contain-fit stage size for the current viewport, renders the
 * layers back-to-front, then mounts the ambient effects (fog, particles,
 * sunlight) configured for the active preset. Recomputes stage only when the
 * viewport or camera FOV changes.
 */
export function SceneContent({ assetBaseUrl, plain = false }: SceneContentProps) {
  const { scene, preset, getAudioFrame, pointerRef } = useRuntime();
  const size = useThree((s) => s.size);
  const quality = useRuntimeStore((s) => s.quality);
  const reducedMotion = useRuntimeStore((s) => s.reducedMotion);
  const styleEngaged = useRuntimeStore((s) => s.styleEngaged);

  const getPointer = useMemo(
    () => () => ({
      x: pointerRef.current.imageSpace.x,
      y: pointerRef.current.imageSpace.y,
      speed: pointerRef.current.speed,
    }),
    [pointerRef],
  );

  const { stage, visible } = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const visibleSize = visibleWorldSize(scene.camera.fov, CAMERA_DISTANCE, aspect);
    return { stage: computeStageSize(scene.aspectRatio, visibleSize), visible: visibleSize };
  }, [size.width, size.height, scene.camera.fov, scene.aspectRatio]);

  // Render far (depth→1) first so nearer layers paint on top.
  const ordered = useMemo(
    () => [...scene.layers].sort((a, b) => b.depth - a.depth),
    [scene.layers],
  );

  const fx = useMemo(() => getPresetEffects(preset.id), [preset.id]);

  return (
    <group>
      {/* Cursor "paint" field that reveals each stroke's AI art style. Mounted
          once styling is engaged (kept mounted afterwards so painted strokes
          persist even when switched back to Original), so it costs nothing on an
          untouched scene. */}
      {styleEngaged && <PaintField stage={stage} visible={visible} getPointer={getPointer} />}

      {ordered.map((layer, index) => (
        <LayerPlane
          key={layer.id}
          layer={layer}
          stage={stage}
          index={index}
          assetBaseUrl={assetBaseUrl}
          plain={plain}
        />
      ))}

      {/* Ambient preset effects. Skipped in plain mode so nothing tints, fogs or
          lights the photo before the cursor paints a style in. */}
      {!plain && fx.fog?.enabled !== false && fx.fog && (
        <FogPlanes
          config={fx.fog}
          stage={stage}
          getAudioFrame={getAudioFrame}
          getPointer={getPointer}
          reducedMotion={reducedMotion}
          quality={quality}
        />
      )}
      {!plain && fx.particles?.enabled !== false && fx.particles && (
        <ParticleField
          config={fx.particles}
          stage={stage}
          getAudioFrame={getAudioFrame}
          reducedMotion={reducedMotion}
          quality={quality}
        />
      )}
      {!plain && fx.sunlight?.enabled !== false && fx.sunlight && (
        <SunlightGlow
          config={fx.sunlight}
          stage={stage}
          getAudioFrame={getAudioFrame}
          reducedMotion={reducedMotion}
        />
      )}
      {!plain && fx.halo?.enabled !== false && fx.halo && (
        <CursorHalo
          config={fx.halo}
          stage={stage}
          getPointer={getPointer}
          reducedMotion={reducedMotion}
        />
      )}
    </group>
  );
}
