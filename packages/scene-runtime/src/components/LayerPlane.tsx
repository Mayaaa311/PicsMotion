'use client';

import type { SceneLayer } from '@interactive-photo/scene-schema';
import { damp } from '@interactive-photo/shared';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useRuntime } from '../context';
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

/**
 * A single photo layer rendered as an unlit textured plane. `meshBasicMaterial`
 * (no lighting, `toneMapped={false}`) shows the original pixels unchanged — a
 * core product rule. Transparent planes are painted back-to-front via
 * `renderOrder` with `depthWrite` off to avoid halos and z-fighting.
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

  const center = useMemo(() => layerCenterWorld(layer, stage), [layer, stage]);
  const size = useMemo(() => layerPlaneSize(layer, stage), [layer, stage]);
  const z = useMemo(() => layerDepthZ(layer.depth), [layer.depth]);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { paused, reducedMotion } = useRuntimeStore.getState();
    if (paused) return;

    const dt = Math.min(rawDelta, 1 / 30);
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
  });

  return (
    <mesh
      ref={meshRef}
      position={[center.x, center.y, z]}
      renderOrder={index}
      rotation={[0, 0, layer.baseRotation]}
      scale={layer.baseScale}
    >
      <planeGeometry args={[size.width, size.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={layer.baseOpacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
