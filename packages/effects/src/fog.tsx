/**
 * Multi-depth drifting fog.
 *
 * Two or three transparent planes at different z depths, each with animated
 * procedural value-noise. Because they sit at different depths they parallax
 * against each other, which reads as volume without a volumetric renderer.
 *
 * Uniforms (per plane)
 *  uTime      float  seconds
 *  uScale     float  noise spatial frequency
 *  uSpeed     float  drift speed multiplier
 *  uDrift     vec2   drift direction
 *  uOpacity   float  effective opacity (config × audio × reduced-motion)
 *  uColor     vec3   fog tint
 *  uSeed      float  per-plane phase offset
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import { clamp, damp } from '@interactive-photo/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface FogConfig {
  enabled: boolean;
  intensity: number;
  /** 2–3 planes; clamped by quality tier. */
  planeCount: number;
  speed: number;
  scale: number;
  opacity: number;
  driftDirection: { x: number; y: number };
  color: string;
  bassSensitivity: number;
}

export const DEFAULT_FOG_CONFIG: FogConfig = {
  enabled: true,
  intensity: 1,
  planeCount: 3,
  speed: 0.02,
  scale: 2.2,
  opacity: 0.18,
  driftDirection: { x: 1, y: 0.12 },
  color: '#eef4ff',
  bassSensitivity: 0.35,
};

const REDUCED_MOTION_SCALE = 0.3;

const FOG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Cheap 2D value noise (hash + bilinear smoothstep interpolation), summed over
 * two octaves. Avoids a texture fetch and is plenty for soft mist.
 */
const FOG_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uSpeed;
  uniform vec2  uDrift;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);          // smoothstep weights
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 drift = uDrift * uTime * uSpeed;
    vec2 p = vUv * uScale + drift + uSeed;
    float n = valueNoise(p) * 0.65 + valueNoise(p * 2.3 + 7.0) * 0.35;

    // Fade the plane out at its vertical edges so it never shows a hard border.
    float edge = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));

    float alpha = n * edge * uOpacity;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;

export interface FogPlanesProps {
  config?: Partial<FogConfig>;
  /** World-space stage size the fog should cover. */
  stage: { width: number; height: number };
  /** z range the planes are distributed across (near, far). */
  depthRange?: [number, number];
  getAudioFrame?: () => AudioFrame | null;
  reducedMotion?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

/** Drifting fog planes distributed across a depth range. */
export function FogPlanes({
  config,
  stage,
  depthRange = [-0.4, -1.6],
  getAudioFrame,
  reducedMotion = false,
  quality = 'high',
}: FogPlanesProps) {
  const cfg = useMemo<FogConfig>(() => ({ ...DEFAULT_FOG_CONFIG, ...config }), [config]);

  // Fewer planes on weaker devices; fog is the cheapest thing to cut.
  const planeCount = useMemo(() => {
    const requested = clamp(Math.round(cfg.planeCount), 1, 3);
    if (quality === 'low') return 1;
    if (quality === 'medium') return Math.min(requested, 2);
    return requested;
  }, [cfg.planeCount, quality]);

  const materials = useMemo(() => {
    const color = new THREE.Color(cfg.color);
    return Array.from({ length: planeCount }, (_, i) =>
      new THREE.ShaderMaterial({
        vertexShader: FOG_VERTEX,
        fragmentShader: FOG_FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: cfg.scale * (1 + i * 0.35) },
          uSpeed: { value: cfg.speed * (1 + i * 0.4) },
          uDrift: {
            value: new THREE.Vector2(cfg.driftDirection.x, cfg.driftDirection.y).normalize(),
          },
          uOpacity: { value: 0 },
          uColor: { value: color },
          uSeed: { value: i * 13.7 },
        },
      }),
    );
  }, [planeCount, cfg.scale, cfg.speed, cfg.driftDirection.x, cfg.driftDirection.y, cfg.color]);

  // Deterministic cleanup of everything we allocated.
  useEffect(
    () => () => {
      for (const m of materials) m.dispose();
    },
    [materials],
  );

  const smoothedBass = useRef(0);

  useFrame((state, rawDelta) => {
    if (!cfg.enabled) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const frame = getAudioFrame?.() ?? null;
    smoothedBass.current = damp(smoothedBass.current, frame ? frame.bass : 0, 3, dt);

    const attenuation = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const audioBoost = 1 + smoothedBass.current * cfg.bassSensitivity;
    const opacity = clamp(cfg.opacity * clamp(cfg.intensity, 0, 1) * audioBoost, 0, 1);

    for (const m of materials) {
      const u = m.uniforms;
      // Freeze drift under reduced motion but keep the fog visible.
      u.uTime!.value = state.clock.elapsedTime * attenuation;
      u.uOpacity!.value = opacity;
    }
  });

  if (!cfg.enabled || planeCount === 0) return null;

  const [near, far] = depthRange;

  return (
    <group>
      {materials.map((material, i) => {
        const t = materials.length === 1 ? 0 : i / (materials.length - 1);
        const z = near + (far - near) * t;
        // Farther planes are scaled up slightly so they still cover the frame.
        const scale = 1 + t * 0.25;
        return (
          <mesh key={i} position={[0, 0, z]} material={material} renderOrder={5 + i}>
            <planeGeometry args={[stage.width * scale, stage.height * scale]} />
          </mesh>
        );
      })}
    </group>
  );
}
