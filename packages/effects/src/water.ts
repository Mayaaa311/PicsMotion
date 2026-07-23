/**
 * Water ripples.
 *
 * A ripple manager holds a bounded set of active ripples; the material's
 * fragment shader sums their radial waves and uses the result to offset the UV
 * it samples the photo at. Because the wave decays with both time and distance,
 * a ripple settles back to still water on its own.
 *
 * Uniforms
 *  uMap          sampler2D   layer texture (original photo pixels)
 *  uOpacity      float       layer base opacity
 *  uTime         float       seconds
 *  uAspect       float       stage aspect, so ripples stay circular
 *  uCount        int         number of active ripples
 *  uCenters      vec2[8]     ripple centres in UV space
 *  uStarts       float[8]    ripple start times
 *  uAmplitudes   float[8]    ripple UV displacement amplitudes
 *  uFrequencies  float[8]    ripple spatial frequencies
 *  uDecays       float[8]    ripple decay rates (1/seconds)
 *  uIntensity    float       master clamp (× reduced-motion)
 */
import { clamp } from '@interactive-photo/shared';
import * as THREE from 'three';

export interface Ripple {
  center: [number, number];
  startTime: number;
  amplitude: number;
  frequency: number;
  decay: number;
}

/** Hard cap — also the shader's compile-time array size. */
export const MAX_RIPPLES = 8;

export interface WaterConfig {
  enabled: boolean;
  intensity: number;
  amplitude: number;
  frequency: number;
  decay: number;
}

export const DEFAULT_WATER_CONFIG: WaterConfig = {
  enabled: true,
  intensity: 1,
  amplitude: 0.012,
  frequency: 28,
  decay: 1.1,
};

const REDUCED_MOTION_SCALE = 0.3;
/** A ripple is considered finished once its envelope falls below this. */
const DEAD_THRESHOLD = 0.01;

/**
 * Bounded pool of active ripples. Adding beyond {@link MAX_RIPPLES} evicts the
 * oldest, so a user mashing the pointer can never grow this without limit.
 */
export class RippleManager {
  private ripples: Ripple[] = [];

  add(
    center: [number, number],
    time: number,
    opts: Partial<Pick<Ripple, 'amplitude' | 'frequency' | 'decay'>> = {},
  ): void {
    const ripple: Ripple = {
      center: [clamp(center[0], 0, 1), clamp(center[1], 0, 1)],
      startTime: time,
      amplitude: opts.amplitude ?? DEFAULT_WATER_CONFIG.amplitude,
      frequency: opts.frequency ?? DEFAULT_WATER_CONFIG.frequency,
      decay: Math.max(opts.decay ?? DEFAULT_WATER_CONFIG.decay, 0.01),
    };
    this.ripples.push(ripple);
    while (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  /** Drop ripples whose envelope has decayed to nothing. */
  prune(time: number): void {
    this.ripples = this.ripples.filter(
      (r) => Math.exp(-(time - r.startTime) * r.decay) > DEAD_THRESHOLD,
    );
  }

  get active(): readonly Ripple[] {
    return this.ripples;
  }

  clear(): void {
    this.ripples = [];
  }
}

const WATER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  #define MAX_RIPPLES ${MAX_RIPPLES}

  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAspect;
  uniform int   uCount;
  uniform vec2  uCenters[MAX_RIPPLES];
  uniform float uStarts[MAX_RIPPLES];
  uniform float uAmplitudes[MAX_RIPPLES];
  uniform float uFrequencies[MAX_RIPPLES];
  uniform float uDecays[MAX_RIPPLES];
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vec2 offset = vec2(0.0);

    for (int i = 0; i < MAX_RIPPLES; i++) {
      if (i >= uCount) break;

      // Correct for stage aspect so rings are circular, not elliptical.
      vec2 delta = vUv - uCenters[i];
      delta.x *= uAspect;
      float dist = length(delta);

      float age = uTime - uStarts[i];
      if (age < 0.0) continue;

      // Envelope decays in time; the ring also weakens with distance.
      float envelope = exp(-age * uDecays[i]) * exp(-dist * 3.0);
      // Travelling wave: phase moves outward as age grows.
      float wave = sin(dist * uFrequencies[i] - age * uFrequencies[i] * 0.35);

      offset += normalize(delta + 1e-6) * wave * envelope * uAmplitudes[i];
    }

    vec2 uv = vUv + offset * uIntensity;
    vec4 texel = texture2D(uMap, clamp(uv, 0.0, 1.0));
    gl_FragColor = vec4(texel.rgb, texel.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** Build the water material for a layer. Created once, never per frame. */
export function createWaterMaterial(
  map: THREE.Texture,
  config: WaterConfig,
  opacity = 1,
  aspect = 1,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uAspect: { value: aspect },
      uCount: { value: 0 },
      uCenters: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector2()) },
      uStarts: { value: new Float32Array(MAX_RIPPLES) },
      uAmplitudes: { value: new Float32Array(MAX_RIPPLES) },
      uFrequencies: { value: new Float32Array(MAX_RIPPLES) },
      uDecays: { value: new Float32Array(MAX_RIPPLES) },
      uIntensity: { value: clamp(config.intensity, 0, 1) },
    },
  });
}

/**
 * Push the current ripple set into the material's uniform arrays. Writes into
 * the existing arrays (no reallocation, no shader recompile).
 */
export function updateWaterUniforms(
  material: THREE.ShaderMaterial,
  time: number,
  ripples: readonly Ripple[],
  reducedMotion: boolean,
  intensity = 1,
): void {
  const u = material.uniforms;
  if (!u) return;

  u.uTime!.value = time;
  const count = Math.min(ripples.length, MAX_RIPPLES);
  u.uCount!.value = count;

  const centers = u.uCenters!.value as THREE.Vector2[];
  const starts = u.uStarts!.value as Float32Array;
  const amps = u.uAmplitudes!.value as Float32Array;
  const freqs = u.uFrequencies!.value as Float32Array;
  const decays = u.uDecays!.value as Float32Array;

  for (let i = 0; i < count; i++) {
    const r = ripples[i]!;
    centers[i]!.set(r.center[0], r.center[1]);
    starts[i] = r.startTime;
    amps[i] = r.amplitude;
    freqs[i] = r.frequency;
    decays[i] = r.decay;
  }

  const attenuation = reducedMotion ? REDUCED_MOTION_SCALE : 1;
  u.uIntensity!.value = clamp(intensity, 0, 1) * attenuation;
}
