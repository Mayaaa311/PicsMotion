/**
 * Postprocessing pipeline (Milestone 4).
 *
 * Wraps @react-three/postprocessing's EffectComposer and configures colour grade,
 * bloom, grain, vignette and chromatic aberration from a preset's PostFXConfig.
 * Bloom and aberration are updated imperatively per frame (audio/pointer) via
 * refs so audio reactivity never triggers React re-renders. A custom Flashlight
 * effect (noisy radial reveal over a darkened scene) powers the Dark preset.
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import {
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  EffectComposer,
  HueSaturation,
  Noise,
  Sepia,
  Vignette,
  wrapEffect,
} from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { BlendFunction, Effect } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { DEFAULT_POSTFX_CONFIG, resolvePostFX, type PostFXConfig } from './postfx-config';

/* -------------------------------------------------------------------------- */
/* Flashlight effect                                                          */
/* -------------------------------------------------------------------------- */

const FLASHLIGHT_FRAGMENT = /* glsl */ `
  uniform vec2  uCursor;
  uniform float uRadius;
  uniform float uFeather;
  uniform float uDarken;
  uniform float uTime;
  uniform float uAspect;
  uniform float uReduced;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 d = uv - uCursor;
    d.x *= uAspect;                        // keep the pool circular
    float dist = length(d);
    // Irregular edge from animated noise (frozen under reduced motion).
    float edge = (noise(uv * 7.0 + uTime * 0.25) - 0.5) * uFeather * (1.0 - uReduced * 0.7);
    float r = uRadius + edge;
    float reveal = 1.0 - smoothstep(r, r + uFeather, dist);
    vec3 dark = inputColor.rgb * (1.0 - uDarken);
    outputColor = vec4(mix(dark, inputColor.rgb, reveal), inputColor.a);
  }
`;

interface FlashlightOptions {
  darken?: number;
  radius?: number;
  feather?: number;
}

/** Custom postprocessing effect: darken the scene, reveal a noisy circle at the cursor. */
export class FlashlightEffect extends Effect {
  constructor({ darken = 0.82, radius = 0.26, feather = 0.28 }: FlashlightOptions = {}) {
    super('FlashlightEffect', FLASHLIGHT_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uCursor', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uRadius', new THREE.Uniform(radius)],
        ['uFeather', new THREE.Uniform(feather)],
        ['uDarken', new THREE.Uniform(darken)],
        ['uTime', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1)],
        ['uReduced', new THREE.Uniform(0)],
      ]),
    });
  }

  get uniformMap(): Map<string, THREE.Uniform> {
    return this.uniforms;
  }
}

const WrappedFlashlight = wrapEffect(FlashlightEffect);

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export interface PostFXProps {
  config?: Partial<PostFXConfig>;
  getAudioFrame?: () => AudioFrame | null;
  /** Cursor accessor in normalized [0,1] image space (origin top-left). */
  getPointer?: () => { x: number; y: number; speed: number };
  reducedMotion?: boolean;
}

export function PostFX({ config, getAudioFrame, getPointer, reducedMotion = false }: PostFXProps) {
  const cfg = useMemo<PostFXConfig>(() => ({ ...DEFAULT_POSTFX_CONFIG, ...config }), [config]);
  const size = useThree((s) => s.size);

  // Resting look (no audio/pointer) drives the static effect props.
  const base = useMemo(
    () => resolvePostFX(cfg, { loudness: 0, beatPulse: 0, pointerSpeed: 0, reducedMotion }),
    [cfg, reducedMotion],
  );

  const bloomRef = useRef<{ intensity: number } | null>(null);
  const aberrationRef = useRef<{ offset: THREE.Vector2 } | null>(null);
  const flashRef = useRef<FlashlightEffect | null>(null);

  useFrame((_, rawDelta) => {
    const frame = getAudioFrame?.() ?? null;
    const pointer = getPointer?.() ?? { x: 0.5, y: 0.5, speed: 0 };
    const resolved = resolvePostFX(cfg, {
      loudness: frame?.loudness ?? 0,
      beatPulse: frame?.beatPulse ?? 0,
      pointerSpeed: pointer.speed,
      reducedMotion,
    });

    if (bloomRef.current) bloomRef.current.intensity = resolved.bloom;
    if (aberrationRef.current) {
      aberrationRef.current.offset.set(resolved.chromaticAberration, resolved.chromaticAberration);
    }
    if (flashRef.current) {
      const u = flashRef.current.uniformMap;
      // Pointer image-space y is top-down; postprocessing uv is bottom-up.
      (u.get('uCursor')!.value as THREE.Vector2).set(pointer.x, 1 - pointer.y);
      u.get('uAspect')!.value = size.width / Math.max(size.height, 1);
      u.get('uReduced')!.value = reducedMotion ? 1 : 0;
      u.get('uTime')!.value += rawDelta;
    }
  });

  if (!cfg.enabled) return null;

  return (
    <EffectComposer>
      <>
        {base.sepia > 0 ? <Sepia intensity={base.sepia} /> : <></>}
        {base.saturation !== 0 || base.brightness !== 0 || base.contrast !== 0 ? (
          <BrightnessContrast brightness={base.brightness} contrast={base.contrast} />
        ) : (
          <></>
        )}
        {base.saturation !== 0 ? <HueSaturation saturation={base.saturation} hue={0} /> : <></>}
        {base.flashlight ? (
          <WrappedFlashlight
            ref={flashRef as never}
            darken={base.darken}
            radius={base.flashlightRadius}
            feather={base.flashlightFeather}
          />
        ) : (
          <></>
        )}
        <Bloom
          ref={bloomRef as never}
          intensity={base.bloom}
          luminanceThreshold={base.bloomThreshold}
          mipmapBlur
        />
        {base.chromaticAberration > 0 || cfg.aberrationPointer > 0 ? (
          <ChromaticAberration
            ref={aberrationRef as never}
            offset={new THREE.Vector2(base.chromaticAberration, base.chromaticAberration)}
            radialModulation={false}
            modulationOffset={0}
          />
        ) : (
          <></>
        )}
        {base.grain > 0 ? <Noise opacity={base.grain} premultiply /> : <></>}
        {base.vignette > 0 ? <Vignette darkness={base.vignette} eskil={false} /> : <></>}
      </>
    </EffectComposer>
  );
}
