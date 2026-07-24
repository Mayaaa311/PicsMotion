/**
 * Soft sunlight glow.
 *
 * An additive radial-gradient plane placed at a normalized image-space point.
 * Its brightness follows a SMOOTHED loudness envelope plus the beat pulse, and
 * is hard-capped by `maxIntensity` — the product rule is "never flash at full
 * intensity", so this must always read as a breath of light, not a strobe.
 *
 * Uniforms
 *  uIntensity float  current effective brightness (already clamped)
 *  uColor     vec3   light tint
 *  uSoftness  float  gradient falloff exponent
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import { clamp, damp } from '@interactive-photo/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface SunlightConfig {
  enabled: boolean;
  intensity: number;
  /** Normalized image-space position (0..1, origin top-left). */
  position: { x: number; y: number };
  /** Radius as a fraction of stage height. */
  radius: number;
  color: string;
  softness: number;
  loudnessSensitivity: number;
  beatSensitivity: number;
  /** Hard ceiling on brightness — deliberately well below 1. */
  maxIntensity: number;
}

export const DEFAULT_SUNLIGHT_CONFIG: SunlightConfig = {
  enabled: true,
  intensity: 1,
  position: { x: 0.72, y: 0.28 },
  radius: 0.55,
  color: '#ffe6b0',
  softness: 2.2,
  loudnessSensitivity: 0.5,
  beatSensitivity: 0.25,
  maxIntensity: 0.35,
};

const REDUCED_MOTION_SCALE = 0.3;
/** Baseline glow present even in silence, as a fraction of maxIntensity. */
const QUIET_FLOOR = 0.35;

const SUN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform vec3  uColor;
  uniform float uSoftness;
  varying vec2 vUv;

  void main() {
    // Radial falloff from the plane centre; pow() shapes the softness.
    float d = length(vUv - vec2(0.5)) * 2.0;
    float falloff = pow(clamp(1.0 - d, 0.0, 1.0), uSoftness);
    gl_FragColor = vec4(uColor, falloff * uIntensity);
  }
`;

export interface SunlightGlowProps {
  config?: Partial<SunlightConfig>;
  stage: { width: number; height: number };
  z?: number;
  getAudioFrame?: () => AudioFrame | null;
  reducedMotion?: boolean;
}

export function SunlightGlow({
  config,
  stage,
  z = -0.3,
  getAudioFrame,
  reducedMotion = false,
}: SunlightGlowProps) {
  const cfg = useMemo<SunlightConfig>(() => ({ ...DEFAULT_SUNLIGHT_CONFIG, ...config }), [config]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SUN_VERTEX,
        fragmentShader: SUN_FRAGMENT,
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

  const envelope = useRef(0);

  useFrame((_, rawDelta) => {
    if (!cfg.enabled) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const frame = getAudioFrame?.() ?? null;

    // Target brightness: a quiet baseline plus smoothed loudness and beat.
    const audio = frame
      ? frame.loudness * cfg.loudnessSensitivity + frame.beatPulse * cfg.beatSensitivity
      : 0;
    const target = QUIET_FLOOR + clamp(audio, 0, 1) * (1 - QUIET_FLOOR);
    // Smooth so light breathes instead of stuttering with the analysis.
    envelope.current = damp(envelope.current, target, 3.5, dt);

    const attenuation = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const ceiling = clamp(cfg.maxIntensity, 0, 1);
    material.uniforms.uIntensity!.value = clamp(
      envelope.current * clamp(cfg.intensity, 0, 1) * ceiling * attenuation,
      0,
      ceiling,
    );
  });

  if (!cfg.enabled) return null;

  const size = stage.height * clamp(cfg.radius, 0.01, 4) * 2;
  // Convert normalized image space (origin top-left) to centred world space.
  const x = (clamp(cfg.position.x, 0, 1) - 0.5) * stage.width;
  const y = (0.5 - clamp(cfg.position.y, 0, 1)) * stage.height;

  return (
    <mesh position={[x, y, z]} material={material} renderOrder={25}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
