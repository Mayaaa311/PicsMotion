/**
 * Spider-Verse comic stylization (Urban preset).
 *
 * A custom postprocessing effect: as the cursor moves it deposits fading "splash"
 * spots along its path (managed on the JS side and pushed into uniform arrays).
 * Inside those splashed regions the image is restyled with the classic
 * Into-the-Spider-Verse print look — Ben-Day halftone dots, posterized colour,
 * and an RGB channel split — strongest where the splash is freshest.
 *
 * Uniforms
 *  uAspect     float      viewport aspect (round splats, round dots)
 *  uResolution vec2       pixel resolution (halftone dot scale)
 *  uCount      int        active splash count
 *  uPos        vec2[N]    splash centres in screen UV
 *  uStr        float[N]   splash strengths (1 fresh → 0 gone)
 *  uRadius     float      splash radius in UV
 *  uDotScale   float      halftone dot frequency
 *  uSplit      float      RGB split amount in UV
 *  uPosterize  float      colour levels (comic banding)
 *  uReduced    float      1 when reduced motion (calmer)
 */
import { clamp } from '@interactive-photo/shared';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';

/** Max simultaneous splashes (also the shader loop bound). */
export const MAX_SPLASH = 16;
/** Seconds a splash takes to fade out. */
export const SPLASH_LIFETIME = 1.6;

export interface SpiderVerseConfig {
  enabled: boolean;
  radius: number;
  dotScale: number;
  split: number;
  posterize: number;
}

export const DEFAULT_SPIDERVERSE_CONFIG: SpiderVerseConfig = {
  enabled: true,
  radius: 0.22,
  dotScale: 1.4,
  split: 0.006,
  posterize: 6,
};

interface Splash {
  x: number;
  y: number;
  born: number;
}

/** A fading trail of comic splash spots deposited by cursor movement. */
export class SplashField {
  private splashes: Splash[] = [];
  add(x: number, y: number, time: number): void {
    this.splashes.push({ x, y, born: time });
    while (this.splashes.length > MAX_SPLASH) this.splashes.shift();
  }
  prune(time: number): void {
    this.splashes = this.splashes.filter((s) => time - s.born < SPLASH_LIFETIME);
  }
  strengthAt(index: number, time: number): number {
    const s = this.splashes[index];
    if (!s) return 0;
    return clamp(1 - (time - s.born) / SPLASH_LIFETIME, 0, 1);
  }
  get active(): readonly Splash[] {
    return this.splashes;
  }
}

const FRAGMENT = /* glsl */ `
  #define MAX_SPLASH ${MAX_SPLASH}
  uniform float uAspect;
  uniform vec2  uResolution;
  uniform int   uCount;
  uniform vec2  uPos[MAX_SPLASH];
  uniform float uStr[MAX_SPLASH];
  uniform float uRadius;
  uniform float uDotScale;
  uniform float uSplit;
  uniform float uPosterize;
  uniform float uReduced;

  // Splash coverage at this uv: max over active splashes of falloff*strength,
  // with a slightly irregular (noisy) edge for an inky splat feel.
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float splashMask(vec2 uv) {
    float m = 0.0;
    for (int i = 0; i < MAX_SPLASH; i++) {
      if (i >= uCount) break;
      vec2 d = uv - uPos[i];
      d.x *= uAspect;
      float dist = length(d);
      float wobble = (hash(floor(uv * 40.0) + float(i)) - 0.5) * uRadius * 0.35;
      float f = 1.0 - smoothstep(0.0, uRadius + wobble, dist);
      m = max(m, f * uStr[i]);
    }
    return clamp(m, 0.0, 1.0);
  }

  vec3 posterize(vec3 c, float levels) {
    return floor(c * levels + 0.5) / levels;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float mask = splashMask(uv);
    if (mask <= 0.001) { outputColor = inputColor; return; }

    // RGB channel split (chromatic offset) — calmer under reduced motion.
    float split = uSplit * mask * (1.0 - uReduced * 0.6);
    float r = texture(inputBuffer, uv + vec2(split, 0.0)).r;
    float g = inputColor.g;
    float b = texture(inputBuffer, uv - vec2(split, 0.0)).b;
    vec3 col = vec3(r, g, b);

    // Comic posterization (colour banding).
    col = posterize(col, max(uPosterize, 2.0));

    // Ben-Day halftone dots modulating brightness, in a rotated screen space.
    float ca = cos(0.4), sa = sin(0.4);
    vec2 rot = mat2(ca, -sa, sa, ca) * (uv * uResolution);
    float cell = max(uDotScale, 0.5) * 6.0;
    vec2 g2 = mod(rot, cell) - cell * 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float dotR = cell * 0.5 * (0.35 + (1.0 - lum) * 0.65);
    float dotv = smoothstep(dotR, dotR - 1.5, length(g2));
    vec3 comic = mix(col * 0.82, col * 1.12, dotv);

    outputColor = vec4(mix(inputColor.rgb, comic, mask), inputColor.a);
  }
`;

export interface SpiderVerseOptions {
  radius?: number;
  dotScale?: number;
  split?: number;
  posterize?: number;
}

/** Custom postprocessing effect for the Spider-Verse comic look. */
export class SpiderVerseEffect extends Effect {
  constructor({ radius = 0.22, dotScale = 1.4, split = 0.006, posterize = 6 }: SpiderVerseOptions = {}) {
    super('SpiderVerseEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uAspect', new THREE.Uniform(1)],
        ['uResolution', new THREE.Uniform(new THREE.Vector2(1280, 720))],
        ['uCount', new THREE.Uniform(0)],
        ['uPos', new THREE.Uniform(Array.from({ length: MAX_SPLASH }, () => new THREE.Vector2()))],
        ['uStr', new THREE.Uniform(new Float32Array(MAX_SPLASH))],
        ['uRadius', new THREE.Uniform(radius)],
        ['uDotScale', new THREE.Uniform(dotScale)],
        ['uSplit', new THREE.Uniform(split)],
        ['uPosterize', new THREE.Uniform(posterize)],
        ['uReduced', new THREE.Uniform(0)],
      ]),
    });
  }

  get uniformMap(): Map<string, THREE.Uniform> {
    return this.uniforms;
  }
}
