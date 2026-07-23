/**
 * Spider-Verse comic stylization (Urban preset).
 *
 * As the cursor moves it deposits "paint" stamps along its path. Each stamp AGES:
 * fresh stamps are small, crisp and strong; as they age they DISPERSE — growing
 * larger with a soft, hard-to-see edge — and fade out slowly. Inside the painted
 * region the image is restyled with the bold Into-the-Spider-Verse print look:
 * chunky Ben-Day halftone dots, posterized + saturated colour, and an RGB
 * channel-split "double vision" offset.
 *
 * Uniforms
 *  uCount      int        active stamp count
 *  uPos        vec2[N]    stamp centres in screen UV
 *  uAge        float[N]   stamp age 0 (fresh) → 1 (gone)
 *  uStampRadius float     fresh stamp radius (UV)
 *  uDispersion float      how much the radius grows as a stamp ages
 *  uStrength   float      global multiplier on the paint mask
 *  uAspect     float      viewport aspect (round dots)
 *  uResolution vec2       pixel resolution (halftone dot scale)
 *  uDotScale   float      halftone dot size (bigger = chunkier)
 *  uSplit      float      RGB split amount in UV
 *  uPosterize  float      colour levels (comic banding)
 *  uSaturation float      extra saturation inside paint
 *  uReduced    float      1 under reduced motion (calmer split)
 */
import { clamp } from '@interactive-photo/shared';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';

/** Max simultaneous stamps (also the shader loop bound). */
export const MAX_SPLASH = 36;
/** Seconds a stamp takes to fully fade (slow). */
export const SPLASH_LIFETIME = 12;

export interface SpiderVerseConfig {
  enabled: boolean;
  /** Min cursor travel (UV) between deposited stamps. */
  spacing: number;
  stampRadius: number;
  dispersion: number;
  dotScale: number;
  split: number;
  posterize: number;
  saturation: number;
  strength: number;
}

export const DEFAULT_SPIDERVERSE_CONFIG: SpiderVerseConfig = {
  enabled: true,
  spacing: 0.02,
  stampRadius: 0.05,
  dispersion: 2.2,
  dotScale: 2.6,
  split: 0.012,
  posterize: 5,
  saturation: 0.5,
  strength: 1.4,
};

interface Stamp {
  x: number;
  y: number;
  born: number;
}

/** A pool of paint stamps deposited along the cursor path; oldest evicted. */
export class SplashField {
  private stamps: Stamp[] = [];
  add(x: number, y: number, time: number): void {
    this.stamps.push({ x, y, born: time });
    while (this.stamps.length > MAX_SPLASH) this.stamps.shift();
  }
  prune(time: number): void {
    this.stamps = this.stamps.filter((s) => time - s.born < SPLASH_LIFETIME);
  }
  /** Age 0 (fresh) → 1 (gone). Out-of-range index returns 1. */
  ageAt(index: number, time: number): number {
    const s = this.stamps[index];
    if (!s) return 1;
    return clamp((time - s.born) / SPLASH_LIFETIME, 0, 1);
  }
  get active(): readonly Stamp[] {
    return this.stamps;
  }
}

/** Pure helper: should a new stamp be deposited given prev stamp + cursor (UV)? */
export function shouldStamp(
  prev: { x: number; y: number } | null,
  cur: { x: number; y: number },
  spacing: number,
): boolean {
  if (!prev) return true;
  return Math.hypot(cur.x - prev.x, cur.y - prev.y) >= spacing;
}

const FRAGMENT = /* glsl */ `
  #define MAX_SPLASH ${MAX_SPLASH}
  uniform int   uCount;
  uniform vec2  uPos[MAX_SPLASH];
  uniform float uAge[MAX_SPLASH];
  uniform float uStampRadius;
  uniform float uDispersion;
  uniform float uStrength;
  uniform float uAspect;
  uniform vec2  uResolution;
  uniform float uDotScale;
  uniform float uSplit;
  uniform float uPosterize;
  uniform float uSaturation;
  uniform float uReduced;

  vec3 posterize(vec3 c, float levels) { return floor(c * levels + 0.5) / levels; }
  vec3 saturate3(vec3 c, float s) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    return clamp(mix(vec3(l), c, 1.0 + s), 0.0, 1.0);
  }

  float paintMask(vec2 uv) {
    float m = 0.0;
    for (int i = 0; i < MAX_SPLASH; i++) {
      if (i >= uCount) break;
      float age = uAge[i];
      if (age >= 1.0) continue;
      // Disperse: radius grows with age; edge softens (inner shrinks).
      float radius = uStampRadius * (1.0 + age * uDispersion);
      float innerF = mix(0.85, 0.05, age);        // fresh: crisp, old: very soft
      vec2 d = uv - uPos[i];
      d.x *= uAspect;
      float dist = length(d);
      float edge = smoothstep(radius, radius * innerF, dist);  // 1 centre → 0 rim
      float strength = pow(1.0 - age, 0.7);       // lingers, then fades slowly
      m = max(m, edge * strength);
    }
    return clamp(m, 0.0, 1.0);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float mask = clamp(paintMask(uv) * uStrength, 0.0, 1.0);
    if (mask <= 0.003) { outputColor = inputColor; return; }

    float split = uSplit * (0.4 + 0.6 * mask) * (1.0 - uReduced * 0.6);
    float r = texture(inputBuffer, uv + vec2(split, split * 0.5)).r;
    float g = inputColor.g;
    float b = texture(inputBuffer, uv - vec2(split, split * 0.5)).b;
    vec3 col = vec3(r, g, b);

    col = saturate3(col, uSaturation);
    col = posterize(col, max(uPosterize, 2.0));

    float ca = cos(0.4), sa = sin(0.4);
    vec2 rot = mat2(ca, -sa, sa, ca) * (uv * uResolution);
    float cell = max(uDotScale, 0.5) * 6.0;
    vec2 g2 = mod(rot, cell) - cell * 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float dotR = cell * 0.5 * (0.30 + (1.0 - lum) * 0.70);
    float dotv = smoothstep(dotR, dotR - 2.0, length(g2));
    vec3 comic = mix(col * 0.7, col * 1.18, dotv);

    outputColor = vec4(mix(inputColor.rgb, comic, mask), inputColor.a);
  }
`;

export interface SpiderVerseOptions {
  stampRadius?: number;
  dispersion?: number;
  dotScale?: number;
  split?: number;
  posterize?: number;
  saturation?: number;
  strength?: number;
}

/** Custom postprocessing effect for the Spider-Verse comic look. */
export class SpiderVerseEffect extends Effect {
  constructor(opts: SpiderVerseOptions = {}) {
    const c = { ...DEFAULT_SPIDERVERSE_CONFIG, ...opts };
    super('SpiderVerseEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uCount', new THREE.Uniform(0)],
        ['uPos', new THREE.Uniform(Array.from({ length: MAX_SPLASH }, () => new THREE.Vector2()))],
        ['uAge', new THREE.Uniform(new Float32Array(MAX_SPLASH).fill(1))],
        ['uStampRadius', new THREE.Uniform(c.stampRadius)],
        ['uDispersion', new THREE.Uniform(c.dispersion)],
        ['uStrength', new THREE.Uniform(c.strength)],
        ['uAspect', new THREE.Uniform(1)],
        ['uResolution', new THREE.Uniform(new THREE.Vector2(1280, 720))],
        ['uDotScale', new THREE.Uniform(c.dotScale)],
        ['uSplit', new THREE.Uniform(c.split)],
        ['uPosterize', new THREE.Uniform(c.posterize)],
        ['uSaturation', new THREE.Uniform(c.saturation)],
        ['uReduced', new THREE.Uniform(0)],
      ]),
    });
  }

  get uniformMap(): Map<string, THREE.Uniform> {
    return this.uniforms;
  }
}
