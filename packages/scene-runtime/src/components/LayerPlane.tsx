'use client';

import {
  createWaterMaterial,
  createWindMaterial,
  DEFAULT_WATER_CONFIG,
  DEFAULT_WIND_CONFIG,
  RippleManager,
  updateWaterUniforms,
  updateWindUniforms,
} from '@interactive-photo/effects';
import { getPresetEffects } from '@interactive-photo/presets';
import type { SceneLayer } from '@interactive-photo/scene-schema';
import { damp } from '@interactive-photo/shared';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useRuntime } from '../context';
import { planLayerEffects } from '../effects/layer-effects';
import {
  layerCenterWorld,
  layerDepthZ,
  layerPlaneSize,
  parallaxOffsetWorld,
  type Size,
} from '../math/coordinates';
import { useRuntimeStore } from '../store';

interface LayerPlaneProps {
  layer: SceneLayer;
  stage: Size;
  index: number;
  assetBaseUrl: string;
}

/** Minimum seconds between drag-spawned ripples, so a drag doesn't flood the pool. */
const RIPPLE_DRAG_INTERVAL = 0.12;
/** Beat strength above which a (low-amplitude) ripple is spawned. */
const RIPPLE_BEAT_THRESHOLD = 0.75;
const RIPPLE_BEAT_INTERVAL = 0.5;

/**
 * A single photo layer rendered as an unlit textured plane.
 *
 * The material is chosen from the layer's tags via {@link planLayerEffects}:
 * plant layers get the wind shader, water layers get the ripple shader, and
 * everything else stays on a plain unlit material. In every case the original
 * photo pixels pass through unlit and un-tone-mapped. Transparent planes are
 * painted back-to-front via `renderOrder` with `depthWrite` off.
 */
export function LayerPlane({ layer, stage, index, assetBaseUrl }: LayerPlaneProps) {
  const { preset, pointerRef, getAudioFrame } = useRuntime();
  const meshRef = useRef<THREE.Mesh>(null);

  const url = assetBaseUrl + layer.assetUrl;
  const texture = useTexture(url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  const plan = useMemo(() => planLayerEffects(layer, preset), [layer, preset]);
  const presetFx = useMemo(() => getPresetEffects(preset.id), [preset.id]);

  // A stable per-layer phase offset so layers don't sway in lockstep.
  const seed = useMemo(
    () => [...layer.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 100,
    [layer.id],
  );

  const stageAspect = stage.width / Math.max(stage.height, 1e-6);

  /** The material for this layer, rebuilt only when the plan/texture changes. */
  const material = useMemo<THREE.Material>(() => {
    if (plan.material === 'wind' && presetFx.wind?.enabled !== false) {
      return createWindMaterial(
        texture,
        { ...DEFAULT_WIND_CONFIG, ...presetFx.wind, stiffness: plan.windStiffness },
        seed,
        layer.baseOpacity,
      );
    }
    if (plan.material === 'water' && presetFx.water?.enabled !== false) {
      return createWaterMaterial(
        texture,
        { ...DEFAULT_WATER_CONFIG, ...presetFx.water },
        layer.baseOpacity,
        stageAspect,
      );
    }
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: layer.baseOpacity,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide,
    });
  }, [plan.material, plan.windStiffness, presetFx, texture, seed, layer.baseOpacity, stageAspect]);

  // Dispose the previous material whenever it is replaced or we unmount.
  useEffect(() => () => material.dispose(), [material]);

  const isShader = material instanceof THREE.ShaderMaterial;
  const ripples = useMemo(() => new RippleManager(), []);
  const lastDragRipple = useRef(0);
  const lastBeatRipple = useRef(0);
  /**
   * Latest render-clock time. Ripple timestamps MUST come from the same clock the
   * shader's `uTime` uses, so we mirror it here for use in pointer handlers
   * (event `timeStamp` is a different time base and would look pre-decayed).
   */
  const clockRef = useRef(0);

  const center = useMemo(() => layerCenterWorld(layer, stage), [layer, stage]);
  const size = useMemo(() => layerPlaneSize(layer, stage), [layer, stage]);
  const z = useMemo(() => layerDepthZ(layer.depth), [layer.depth]);

  /** Spawn a ripple at a pointer event's UV (only for ripple-enabled layers). */
  const spawnRipple = (event: ThreeEvent<PointerEvent>, amplitude?: number) => {
    if (!plan.rippleEnabled || !event.uv) return;
    ripples.add([event.uv.x, event.uv.y], clockRef.current, amplitude ? { amplitude } : undefined);
  };

  useFrame((state, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { paused, reducedMotion } = useRuntimeStore.getState();
    if (paused) return;

    const dt = Math.min(rawDelta, 1 / 30);
    const time = state.clock.elapsedTime;
    clockRef.current = time;
    const pointer = pointerRef.current;
    // Convert normalized [0,1] pointer to centered [-1,1].
    const pc = { x: pointer.normalized.x * 2 - 1, y: pointer.normalized.y * 2 - 1 };
    const target = parallaxOffsetWorld(pc, layer, stage, preset.camera.parallaxStrength, reducedMotion);

    // Damp toward the target offset for smooth, frame-rate-independent motion.
    // Note: pointer y grows downward; negate so layers rise as the cursor rises.
    mesh.position.x = damp(mesh.position.x, center.x + target.x, 6, dt);
    mesh.position.y = damp(mesh.position.y, center.y - target.y, 6, dt);

    // Subtle audio-reactive scale pulse, weighted by this layer's authored
    // sensitivity. Bounded so the subject never throbs distractingly.
    const frame = getAudioFrame();
    let targetScale = layer.baseScale;
    if (frame) {
      const s = layer.audioSensitivity;
      const energy = s.beat * frame.beatPulse + s.loudness * frame.loudness + s.bass * frame.bass;
      const pulse = (reducedMotion ? 0.25 : 1) * Math.min(energy, 1.5) * 0.03; // <=~4.5%
      targetScale = layer.baseScale * (1 + pulse);
    }
    const nextScale = damp(mesh.scale.x, targetScale, 8, dt);
    mesh.scale.setScalar(nextScale);

    if (!isShader) return;
    const shader = material as THREE.ShaderMaterial;

    if (plan.material === 'wind') {
      // Cursor UV: image space is top-down, UV is bottom-up.
      updateWindUniforms(shader, {
        time,
        cursorUv: { x: pointer.imageSpace.x, y: 1 - pointer.imageSpace.y },
        audioWind: frame ? Math.max(frame.lowMid, frame.bass) : 0,
        reducedMotion,
      });
    } else if (plan.material === 'water') {
      // Low-amplitude ripples on strong beats keep still water alive with music.
      if (
        frame &&
        frame.beatPulse > RIPPLE_BEAT_THRESHOLD &&
        time - lastBeatRipple.current > RIPPLE_BEAT_INTERVAL &&
        plan.rippleEnabled
      ) {
        lastBeatRipple.current = time;
        ripples.add([pointer.imageSpace.x, 1 - pointer.imageSpace.y], time, { amplitude: 0.004 });
      }
      ripples.prune(time);
      updateWaterUniforms(
        shader,
        time,
        ripples.active,
        reducedMotion,
        presetFx.water?.intensity ?? DEFAULT_WATER_CONFIG.intensity,
      );
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[center.x, center.y, z]}
      renderOrder={index}
      rotation={[0, 0, layer.baseRotation]}
      scale={layer.baseScale}
      material={material}
      onPointerDown={(e) => spawnRipple(e)}
      onPointerMove={(e) => {
        // Slow drags trail ripples across the surface, rate-limited (render clock).
        if (!plan.rippleEnabled || !pointerRef.current.isDown) return;
        const t = clockRef.current;
        if (t - lastDragRipple.current < RIPPLE_DRAG_INTERVAL) return;
        lastDragRipple.current = t;
        spawnRipple(e, 0.008);
      }}
    >
      <planeGeometry args={[size.width, size.height]} />
    </mesh>
  );
}
