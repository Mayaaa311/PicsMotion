/**
 * Wind deformation for plant/foliage layers.
 *
 * A vertex shader bends the layer away from the cursor while keeping its BASE
 * ANCHORED — grass roots stay planted. The bend weight comes from UV height:
 * three.js UVs have their origin at the BOTTOM-left, so `vUv.y == 0` is the base
 * of the plant and `vUv.y == 1` the tip. Squaring it makes the tip flex much
 * more than the middle, like a real stem.
 *
 * Uniforms
 *  uMap             sampler2D  layer texture (original photo pixels)
 *  uOpacity         float      layer base opacity
 *  uTime            float      seconds, drives procedural sway
 *  uSeed            float      per-layer phase offset so layers desync
 *  uCursorUv        vec2       cursor position in this layer's UV space
 *  uCursorStrength  float      bend amount from cursor proximity
 *  uInnerRadius     float      UV distance where cursor influence is full
 *  uOuterRadius     float      UV distance where cursor influence reaches zero
 *  uWindSpeed       float      procedural sway time scale
 *  uFrequency       float      procedural sway spatial frequency
 *  uNaturalStrength float      ambient sway amplitude
 *  uAudioWind       float      normalized audio energy (0..1)
 *  uAudioStrength   float      how much audio adds to the bend
 *  uStiffness       float      bend resistance (>=1); higher = less movement
 */
import { clamp } from '@interactive-photo/shared';
import * as THREE from 'three';

export interface WindConfig {
  enabled: boolean;
  /** Master clamp on the whole effect, 0..1. */
  intensity: number;
  cursorStrength: number;
  naturalStrength: number;
  windSpeed: number;
  frequency: number;
  /** Per-layer bend resistance (>= 1). */
  stiffness: number;
  innerRadius: number;
  outerRadius: number;
  audioStrength: number;
}

export const DEFAULT_WIND_CONFIG: WindConfig = {
  enabled: true,
  intensity: 1,
  cursorStrength: 0.06,
  naturalStrength: 0.012,
  windSpeed: 0.6,
  frequency: 2.5,
  stiffness: 1,
  innerRadius: 0.05,
  outerRadius: 0.45,
  audioStrength: 0.03,
};

export interface WindUniformInput {
  time: number;
  cursorUv: { x: number; y: number };
  /** Normalized audio energy driving extra sway, 0..1. */
  audioWind: number;
  reducedMotion: boolean;
}

/** Attenuation applied to all motion when the user prefers reduced motion. */
const REDUCED_MOTION_SCALE = 0.3;

/**
 * TS mirror of the GLSL bend math, so the behaviour is unit-testable without a
 * GPU. Keep this in sync with the vertex shader below.
 */
export function computeBendAmount(input: {
  /** pow(uv.y, 2) — 0 at the anchored base, 1 at the tip. */
  flexibility: number;
  procedural: number;
  cursorInfluence: number;
  cursorStrength: number;
  audioWind: number;
  audioStrength: number;
  stiffness: number;
  intensity: number;
  reducedMotion: boolean;
}): number {
  const flexibility = clamp(input.flexibility, 0, 1);
  const stiffness = Math.max(input.stiffness, 1);
  const attenuation = input.reducedMotion ? REDUCED_MOTION_SCALE : 1;
  const drivers =
    input.procedural +
    clamp(input.cursorInfluence, 0, 1) * input.cursorStrength +
    clamp(input.audioWind, 0, 1) * input.audioStrength;

  const bend = (flexibility * drivers * clamp(input.intensity, 0, 1) * attenuation) / stiffness;
  return Number.isFinite(bend) ? bend : 0;
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform vec2  uCursorUv;
  uniform float uCursorStrength;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uWindSpeed;
  uniform float uFrequency;
  uniform float uNaturalStrength;
  uniform float uAudioWind;
  uniform float uAudioStrength;
  uniform float uStiffness;
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vUv = uv;

    // UV origin is bottom-left, so v=0 is the anchored base of the plant.
    float flexibility = pow(clamp(uv.y, 0.0, 1.0), 2.0);

    float proceduralWind =
      sin(uTime * uWindSpeed + position.y * uFrequency + uSeed) * uNaturalStrength;

    float cursorDistance = distance(uv, uCursorUv);
    float cursorInfluence = 1.0 - smoothstep(uInnerRadius, uOuterRadius, cursorDistance);

    float drivers =
      proceduralWind
      + cursorInfluence * uCursorStrength
      + clamp(uAudioWind, 0.0, 1.0) * uAudioStrength;

    float bend = flexibility * drivers * uIntensity / max(uStiffness, 1.0);

    // Push AWAY from the cursor horizontally: sign follows uv.x - cursor.x.
    float away = sign(uv.x - uCursorUv.x);
    if (away == 0.0) away = 1.0;

    vec3 displaced = position;
    displaced.x += bend * away;
    // A little vertical give so the bend reads as a stem arc, not a shear.
    displaced.y -= abs(bend) * 0.25;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    // Unlit and untone-mapped: the original photograph's pixels pass through.
    gl_FragColor = vec4(texel.rgb, texel.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * Build the wind ShaderMaterial for a layer. Created once per layer — never
 * inside a frame loop (that would recompile the shader).
 */
export function createWindMaterial(
  map: THREE.Texture,
  config: WindConfig,
  seed = 0,
  opacity = 1,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uCursorUv: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorStrength: { value: config.cursorStrength },
      uInnerRadius: { value: config.innerRadius },
      uOuterRadius: { value: config.outerRadius },
      uWindSpeed: { value: config.windSpeed },
      uFrequency: { value: config.frequency },
      uNaturalStrength: { value: config.naturalStrength },
      uAudioWind: { value: 0 },
      uAudioStrength: { value: config.audioStrength },
      uStiffness: { value: Math.max(config.stiffness, 1) },
      // uIntensity is the *effective* value written each frame; uIntensityBase is
      // the authored value it is derived from (so attenuation never compounds).
      uIntensity: { value: clamp(config.intensity, 0, 1) },
      uIntensityBase: { value: clamp(config.intensity, 0, 1) },
    },
  });
}

/**
 * Per-frame uniform update. Only writes numbers into existing uniforms, so the
 * shader is never recompiled while the pointer or audio moves.
 */
export function updateWindUniforms(
  material: THREE.ShaderMaterial,
  input: WindUniformInput,
): void {
  const u = material.uniforms;
  if (!u) return;
  const attenuation = input.reducedMotion ? REDUCED_MOTION_SCALE : 1;

  u.uTime!.value = input.time;
  (u.uCursorUv!.value as THREE.Vector2).set(
    clamp(input.cursorUv.x, 0, 1),
    clamp(input.cursorUv.y, 0, 1),
  );
  u.uAudioWind!.value = clamp(input.audioWind, 0, 1);
  // Derive the effective intensity from the authored base every frame so the
  // reduced-motion attenuation never compounds.
  const base = clamp((u.uIntensityBase?.value as number | undefined) ?? 1, 0, 1);
  u.uIntensity!.value = base * attenuation;
}

/**
 * Apply a config to an existing material (e.g. after a preset change) without
 * recreating it.
 */
export function applyWindConfig(material: THREE.ShaderMaterial, config: WindConfig): void {
  const u = material.uniforms;
  if (!u) return;
  u.uCursorStrength!.value = config.cursorStrength;
  u.uInnerRadius!.value = config.innerRadius;
  u.uOuterRadius!.value = config.outerRadius;
  u.uWindSpeed!.value = config.windSpeed;
  u.uFrequency!.value = config.frequency;
  u.uNaturalStrength!.value = config.naturalStrength;
  u.uAudioStrength!.value = config.audioStrength;
  u.uStiffness!.value = Math.max(config.stiffness, 1);
  const intensity = clamp(config.intensity, 0, 1);
  u.uIntensity!.value = intensity;
  if (u.uIntensityBase) u.uIntensityBase.value = intensity;
}
