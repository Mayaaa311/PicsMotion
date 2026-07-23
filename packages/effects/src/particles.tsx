/**
 * Gentle drifting particle field (pollen / dust).
 *
 * A single `Points` object with preallocated position/velocity/phase buffers.
 * Positions are updated in place every frame — no allocation in the hot path —
 * and wrap around the stage so the field never empties.
 *
 * Uniforms
 *  uSize       float  base point size in world units
 *  uColor      vec3   particle tint
 *  uOpacity    float  effective opacity (config × audio × reduced-motion)
 *  uPixelRatio float  device pixel ratio, so points scale with DPR
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import { clamp, damp, PARTICLE_BUDGET } from '@interactive-photo/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface ParticleConfig {
  enabled: boolean;
  intensity: number;
  type: 'pollen' | 'dust';
  count: number;
  speed: number;
  size: number;
  color: string;
  opacity: number;
  trebleSensitivity: number;
}

export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  enabled: true,
  intensity: 1,
  type: 'pollen',
  count: 350,
  speed: 0.08,
  size: 0.03,
  color: '#fff3c4',
  opacity: 0.55,
  trebleSensitivity: 0.4,
};

const REDUCED_MOTION_SCALE = 0.3;

const PARTICLE_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Perspective-correct point size: shrink with distance.
    gl_PointSize = uSize * uPixelRatio * (300.0 / -mvPosition.z);
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    // Soft round sprite from the point coord — avoids needing a texture.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(uColor, falloff * uOpacity);
  }
`;

export interface ParticleFieldProps {
  config?: Partial<ParticleConfig>;
  stage: { width: number; height: number };
  /** z range particles occupy (near, far). */
  depthRange?: [number, number];
  getAudioFrame?: () => AudioFrame | null;
  reducedMotion?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

export function ParticleField({
  config,
  stage,
  depthRange = [-0.2, -1.4],
  getAudioFrame,
  reducedMotion = false,
  quality = 'high',
}: ParticleFieldProps) {
  const cfg = useMemo<ParticleConfig>(() => ({ ...DEFAULT_PARTICLE_CONFIG, ...config }), [config]);
  const pixelRatio = useThree((s) => s.viewport.dpr);

  // Respect the quality tier's particle ceiling.
  const count = useMemo(
    () => clamp(Math.round(cfg.count), 0, PARTICLE_BUDGET[quality]),
    [cfg.count, quality],
  );

  /** Preallocated buffers; mutated in place each frame. */
  const buffers = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const [near, far] = depthRange;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * stage.width;
      positions[i3 + 1] = (Math.random() - 0.5) * stage.height;
      positions[i3 + 2] = near + Math.random() * (far - near);
      // Mostly sideways drift with a slow upward bias — pollen, not rain.
      velocities[i3] = (Math.random() - 0.3) * 0.5;
      velocities[i3 + 1] = (Math.random() - 0.25) * 0.35;
      velocities[i3 + 2] = 0;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, velocities, phases };
  }, [count, stage.width, stage.height, depthRange]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    return g;
  }, [buffers]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uSize: { value: cfg.size },
          uColor: { value: new THREE.Color(cfg.color) },
          uOpacity: { value: cfg.opacity },
          uPixelRatio: { value: pixelRatio },
        },
      }),
    [cfg.size, cfg.color, cfg.opacity, pixelRatio],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const smoothedTreble = useRef(0);
  const pointsRef = useRef<THREE.Points>(null);

  useFrame((state, rawDelta) => {
    if (!cfg.enabled || count === 0) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const frame = getAudioFrame?.() ?? null;
    smoothedTreble.current = damp(smoothedTreble.current, frame ? frame.treble : 0, 4, dt);

    const attenuation = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const speed = cfg.speed * clamp(cfg.intensity, 0, 1) * attenuation;
    const { positions, velocities, phases } = buffers;
    const halfW = stage.width / 2;
    const halfH = stage.height / 2;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Sinusoidal wobble makes the drift feel airborne rather than linear.
      const wobble = Math.sin(t * 0.6 + phases[i]!) * 0.25;
      positions[i3]! += (velocities[i3]! + wobble) * speed * dt;
      positions[i3 + 1]! += velocities[i3 + 1]! * speed * dt;

      // Wrap around the stage bounds.
      if (positions[i3]! > halfW) positions[i3] = -halfW;
      else if (positions[i3]! < -halfW) positions[i3] = halfW;
      if (positions[i3 + 1]! > halfH) positions[i3 + 1] = -halfH;
      else if (positions[i3 + 1]! < -halfH) positions[i3 + 1] = halfH;
    }

    geometry.attributes.position!.needsUpdate = true;
    material.uniforms.uOpacity!.value = clamp(
      cfg.opacity * clamp(cfg.intensity, 0, 1) * (1 + smoothedTreble.current * cfg.trebleSensitivity),
      0,
      1,
    );
  });

  if (!cfg.enabled || count === 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} renderOrder={20} />;
}
