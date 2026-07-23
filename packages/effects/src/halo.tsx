/**
 * Dwell halo (Nostalgic preset).
 *
 * A warm radial glow that appears where the cursor comes to rest and grows more
 * present the longer it stays still, then fades gently once the cursor moves on
 * or leaves. Additive world-space plane that follows the cursor.
 *
 * Uniforms
 *  uIntensity float  current effective brightness (clamped)
 *  uColor     vec3   halo tint
 *  uSoftness  float  radial falloff exponent
 */
import { clamp, damp } from '@interactive-photo/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface HaloConfig {
  enabled: boolean;
  intensity: number;
  radius: number; // fraction of stage height
  color: string;
  softness: number;
  maxIntensity: number;
  /** Pointer speed below which the halo builds (dwell). */
  stillSpeed: number;
  buildRate: number; // how fast it grows while still
  fadeRate: number; // how fast it fades once moving/absent
}

export const DEFAULT_HALO_CONFIG: HaloConfig = {
  enabled: true,
  intensity: 1,
  radius: 0.3,
  color: '#ffdca0',
  softness: 2.4,
  maxIntensity: 0.5,
  stillSpeed: 0.06,
  buildRate: 0.9,
  fadeRate: 1.6,
};

const REDUCED_MOTION_SCALE = 0.4;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform vec3  uColor;
  uniform float uSoftness;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - vec2(0.5)) * 2.0;
    float falloff = pow(clamp(1.0 - d, 0.0, 1.0), uSoftness);
    gl_FragColor = vec4(uColor, falloff * uIntensity);
  }
`;

export interface CursorHaloProps {
  config?: Partial<HaloConfig>;
  stage: { width: number; height: number };
  getPointer?: () => { x: number; y: number; speed: number };
  z?: number;
  reducedMotion?: boolean;
}

export function CursorHalo({
  config,
  stage,
  getPointer,
  z = -0.05,
  reducedMotion = false,
}: CursorHaloProps) {
  const cfg = useMemo<HaloConfig>(() => ({ ...DEFAULT_HALO_CONFIG, ...config }), [config]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uIntensity: { value: 0 },
          uColor: { value: new THREE.Color(cfg.color) },
          uSoftness: { value: cfg.softness },
        },
      }),
    [cfg.color, cfg.softness],
  );

  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<THREE.Mesh>(null);
  const envelope = useRef(0);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || !cfg.enabled) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const pointer = getPointer?.() ?? { x: 0.5, y: 0.5, speed: 0 };

    // Dwell: build while the cursor is (nearly) still, fade while it moves.
    const still = pointer.speed < cfg.stillSpeed;
    const target = still ? 1 : 0;
    const rate = still ? cfg.buildRate : cfg.fadeRate;
    envelope.current = damp(envelope.current, target, rate, dt);

    // Follow the cursor (image space is top-down → world y flips).
    const worldX = (clamp(pointer.x, 0, 1) - 0.5) * stage.width;
    const worldY = (0.5 - clamp(pointer.y, 0, 1)) * stage.height;
    // Snap position while faded/moving; ease while resting so it feels placed.
    mesh.position.x = still ? damp(mesh.position.x, worldX, 8, dt) : worldX;
    mesh.position.y = still ? damp(mesh.position.y, worldY, 8, dt) : worldY;

    const ceiling = clamp(cfg.maxIntensity, 0, 1);
    const atten = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    material.uniforms.uIntensity!.value = clamp(
      envelope.current * clamp(cfg.intensity, 0, 1) * ceiling * atten,
      0,
      ceiling,
    );
  });

  if (!cfg.enabled) return null;
  const size = stage.height * clamp(cfg.radius, 0.01, 3) * 2;

  return (
    <mesh ref={meshRef} position={[0, 0, z]} material={material} renderOrder={26}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
