/**
 * Spider-Verse comic stylization (Urban preset).
 *
 * The cursor "throws paint" onto a persistent accumulation buffer (see
 * {@link PaintAccumulator} in paint-buffer). New stamps ADD into the buffer;
 * each frame it decays linearly (so a stroke takes ~1 minute to disappear) and
 * diffuses slightly (so older paint disperses with a soft, hard-to-see edge).
 * This effect reads that buffer and, where paint has landed, restyles the image
 * with the bold Into-the-Spider-Verse print look: chunky Ben-Day halftone dots,
 * posterized + saturated colour, and an RGB channel-split "double vision" offset.
 *
 * Uniforms
 *  uPaint      sampler2D  persistent paint coverage (r channel)
 *  uHasPaint   float      1 when a paint texture is bound
 *  uStrength   float      multiplier applied to the paint mask
 *  uResolution vec2       pixel resolution (halftone dot scale)
 *  uDotScale   float      halftone dot size (bigger = chunkier)
 *  uSplit      float      RGB split amount in UV
 *  uPosterize  float      colour levels (comic banding)
 *  uSaturation float      extra saturation inside paint
 *  uReduced    float      1 under reduced motion (calmer split)
 */
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';

export interface SpiderVerseConfig {
  enabled: boolean;
  /** Min cursor travel (UV) between deposited stamps. */
  spacing: number;
  /** Paint stamp radius (UV). */
  stampRadius: number;
  /** Seconds for a stroke to fully fade. */
  lifetime: number;
  dotScale: number;
  split: number;
  posterize: number;
  saturation: number;
  strength: number;
}

export const DEFAULT_SPIDERVERSE_CONFIG: SpiderVerseConfig = {
  enabled: true,
  spacing: 0.02,
  stampRadius: 0.055,
  lifetime: 60,
  dotScale: 2.6,
  split: 0.012,
  posterize: 5,
  saturation: 0.5,
  strength: 1.5,
};

/** Pure: should a new stamp be deposited given the previous stamp + cursor (UV)? */
export function shouldStamp(
  prev: { x: number; y: number } | null,
  cur: { x: number; y: number },
  spacing: number,
): boolean {
  if (!prev) return true;
  return Math.hypot(cur.x - prev.x, cur.y - prev.y) >= spacing;
}

/**
 * Pure: evenly-spaced points from `prev` (exclusive) to `cur` (inclusive) so a
 * fast cursor jump still lays a continuous stroke. Capped to `maxPoints` so a
 * huge jump can't stamp thousands of quads in one frame.
 */
export function interpolateStamps(
  prev: { x: number; y: number } | null,
  cur: { x: number; y: number },
  spacing: number,
  maxPoints = 24,
): Array<{ x: number; y: number }> {
  if (!prev) return [cur];
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist < spacing) return [];
  const steps = Math.min(Math.floor(dist / spacing), maxPoints);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: prev.x + dx * t, y: prev.y + dy * t });
  }
  return out;
}

const FALLBACK_PAINT = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
FALLBACK_PAINT.needsUpdate = true;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uPaint;
  uniform float uHasPaint;
  uniform float uStrength;
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

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float mask = uHasPaint > 0.5 ? clamp(texture(uPaint, uv).r * uStrength, 0.0, 1.0) : 0.0;
    if (mask <= 0.003) { outputColor = inputColor; return; }

    // Bold RGB "double vision" channel split.
    float split = uSplit * (0.4 + 0.6 * mask) * (1.0 - uReduced * 0.6);
    float r = texture(inputBuffer, uv + vec2(split, split * 0.5)).r;
    float g = inputColor.g;
    float b = texture(inputBuffer, uv - vec2(split, split * 0.5)).b;
    vec3 col = vec3(r, g, b);

    col = saturate3(col, uSaturation);
    col = posterize(col, max(uPosterize, 2.0));

    // Chunky Ben-Day halftone dots in a rotated screen grid.
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
        ['uPaint', new THREE.Uniform(FALLBACK_PAINT)],
        ['uHasPaint', new THREE.Uniform(0)],
        ['uStrength', new THREE.Uniform(c.strength)],
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
