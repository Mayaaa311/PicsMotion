/**
 * Interactive, layered fog (Soft Nature).
 *
 * Two or three transparent planes at different z depths, each with animated
 * value-noise shaped into wispy clumps (not a flat veil). The cursor acts like
 * wind: as it moves it deposits fading "clear spots" along its path, so fog
 * dissipates where you sweep and returns gradually (over a few seconds) once you
 * stop. This keeps the photograph legible while the fog stays alive.
 *
 * Uniforms (per plane)
 *  uTime         float      seconds
 *  uScale        float      noise spatial frequency
 *  uSpeed        float      drift speed multiplier
 *  uDrift        vec2       drift direction
 *  uOpacity      float      effective opacity (config × audio × reduced-motion)
 *  uColor        vec3       fog tint
 *  uSeed         float      per-plane phase offset
 *  uAspect       float      stage aspect (circular clear spots)
 *  uClearCount   int        active clear-spot count
 *  uClearPos     vec2[N]    clear-spot centres in UV
 *  uClearStr     float[N]   clear-spot strengths (1 → fresh, 0 → gone)
 *  uClearRadius  float      clear-spot radius in UV
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import { clamp, damp } from '@interactive-photo/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Max simultaneous clear spots (also the shader loop bound). */
const MAX_CLEAR = 20;
/** Seconds a clear spot lives before fog fully returns. */
const CLEAR_LIFETIME = 8;
/** Fraction of the lifetime the patch stays fully clear before it starts to fade. */
const CLEAR_HOLD = 0.55;
/** Min cursor travel (UV) between deposited clear spots — spacing avoids a "snake". */
const CLEAR_SPACING = 0.07;

export interface FogConfig {
  enabled: boolean;
  intensity: number;
  planeCount: number;
  speed: number;
  scale: number;
  opacity: number;
  driftDirection: { x: number; y: number };
  color: string;
  bassSensitivity: number;
  /** How strongly the cursor clears fog (0 disables interaction). */
  clearStrength: number;
  clearRadius: number;
}

export const DEFAULT_FOG_CONFIG: FogConfig = {
  enabled: true,
  intensity: 1,
  planeCount: 3,
  speed: 0.02,
  scale: 2.6,
  opacity: 0.14,
  driftDirection: { x: 1, y: 0.12 },
  color: '#eef4ff',
  bassSensitivity: 0.3,
  clearStrength: 1,
  clearRadius: 0.22,
};

const REDUCED_MOTION_SCALE = 0.3;

interface ClearSpot {
  x: number;
  y: number;
  born: number;
}

/** A fading trail of cursor-clear spots; oldest evicted past MAX_CLEAR. */
class ClearField {
  private spots: ClearSpot[] = [];
  add(x: number, y: number, time: number): void {
    this.spots.push({ x, y, born: time });
    while (this.spots.length > MAX_CLEAR) this.spots.shift();
  }
  prune(time: number): void {
    this.spots = this.spots.filter((s) => time - s.born < CLEAR_LIFETIME);
  }
  get active(): readonly ClearSpot[] {
    return this.spots;
  }
}

const FOG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  #define MAX_CLEAR ${MAX_CLEAR}
  uniform float uTime;
  uniform float uScale;
  uniform float uSpeed;
  uniform vec2  uDrift;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform float uSeed;
  uniform float uAspect;
  uniform int   uClearCount;
  uniform vec2  uClearPos[MAX_CLEAR];
  uniform float uClearStr[MAX_CLEAR];
  uniform float uClearRadius;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float valueNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 drift = uDrift * uTime * uSpeed;
    vec2 p = vUv * uScale + drift + uSeed;
    float n = valueNoise(p) * 0.65 + valueNoise(p * 2.3 + 7.0) * 0.35;
    n = pow(clamp(n, 0.0, 1.0), 1.6);            // shape into wispy clumps

    float edge = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));

    // Cursor "wind": remove fog near recent clear spots, strongest when fresh.
    float clear = 0.0;
    for (int i = 0; i < MAX_CLEAR; i++) {
      if (i >= uClearCount) break;
      vec2 d = vUv - uClearPos[i];
      d.x *= uAspect;
      float f = 1.0 - smoothstep(0.0, uClearRadius, length(d));
      clear = max(clear, f * uClearStr[i]);
    }

    float alpha = n * edge * uOpacity * (1.0 - clamp(clear, 0.0, 1.0));
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;

export interface FogPlanesProps {
  config?: Partial<FogConfig>;
  stage: { width: number; height: number };
  depthRange?: [number, number];
  getAudioFrame?: () => AudioFrame | null;
  /** Cursor accessor: image-space [0,1] (origin top-left) + speed. */
  getPointer?: () => { x: number; y: number; speed: number };
  reducedMotion?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

export function FogPlanes({
  config,
  stage,
  depthRange = [-0.4, -1.6],
  getAudioFrame,
  getPointer,
  reducedMotion = false,
  quality = 'high',
}: FogPlanesProps) {
  const cfg = useMemo<FogConfig>(() => ({ ...DEFAULT_FOG_CONFIG, ...config }), [config]);

  const planeCount = useMemo(() => {
    const requested = clamp(Math.round(cfg.planeCount), 1, 3);
    if (quality === 'low') return 1;
    if (quality === 'medium') return Math.min(requested, 2);
    return requested;
  }, [cfg.planeCount, quality]);

  const aspect = stage.width / Math.max(stage.height, 1e-6);

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
          uAspect: { value: aspect },
          uClearCount: { value: 0 },
          uClearPos: { value: Array.from({ length: MAX_CLEAR }, () => new THREE.Vector2()) },
          uClearStr: { value: new Float32Array(MAX_CLEAR) },
          uClearRadius: { value: cfg.clearRadius * (1 - i * 0.12) },
        },
      }),
    );
  }, [planeCount, cfg.scale, cfg.speed, cfg.driftDirection.x, cfg.driftDirection.y, cfg.color, cfg.clearRadius, aspect]);

  useEffect(
    () => () => {
      for (const m of materials) m.dispose();
    },
    [materials],
  );

  const smoothedBass = useRef(0);
  const clearField = useMemo(() => new ClearField(), []);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  useFrame((state, rawDelta) => {
    if (!cfg.enabled) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const time = state.clock.elapsedTime;
    const frame = getAudioFrame?.() ?? null;
    smoothedBass.current = damp(smoothedBass.current, frame ? frame.bass : 0, 3, dt);

    // Deposit clear spots as the cursor moves (wind gusts along the path).
    const pointer = getPointer?.() ?? null;
    if (pointer && cfg.clearStrength > 0 && !reducedMotion) {
      const cx = pointer.x;
      const cy = 1 - pointer.y; // image space is top-down; UV is bottom-up
      const prev = lastPointer.current;
      const moved = prev ? Math.hypot(cx - prev.x, cy - prev.y) : 0;
      if (!prev || moved > CLEAR_SPACING) {
        clearField.add(cx, cy, time);
        lastPointer.current = { x: cx, y: cy };
      }
    }
    clearField.prune(time);
    const spots = clearField.active;

    const attenuation = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const audioBoost = 1 + smoothedBass.current * cfg.bassSensitivity;
    const opacity = clamp(cfg.opacity * clamp(cfg.intensity, 0, 1) * audioBoost, 0, 1);

    for (const m of materials) {
      const u = m.uniforms;
      u.uTime!.value = state.clock.elapsedTime * attenuation;
      u.uOpacity!.value = opacity;
      u.uClearCount!.value = spots.length;
      const pos = u.uClearPos!.value as THREE.Vector2[];
      const str = u.uClearStr!.value as Float32Array;
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i]!;
        pos[i]!.set(s.x, s.y);
        // Hold fully clear for CLEAR_HOLD of the lifetime, then ease back slowly.
        const age = (time - s.born) / CLEAR_LIFETIME;
        const raw = age < CLEAR_HOLD ? 1 : clamp(1 - (age - CLEAR_HOLD) / (1 - CLEAR_HOLD), 0, 1);
        str[i] = raw * clamp(cfg.clearStrength, 0, 1);
      }
    }
  });

  if (!cfg.enabled || planeCount === 0) return null;

  const [near, far] = depthRange;

  return (
    <group>
      {materials.map((material, i) => {
        const t = materials.length === 1 ? 0 : i / (materials.length - 1);
        const z = near + (far - near) * t;
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
