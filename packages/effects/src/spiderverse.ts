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
  lifetime: 80,
  dotScale: 2.6,
  split: 0.012,
  posterize: 5,
  saturation: 0.5,
  strength: 1.5,
};

/**
 * Comic colour palettes (4 stops each, dark → light). The image's luminance is
 * mapped into these flat fills, so the paint reads as bold comic colour rather
 * than the photo's own hues. A strong beat cycles to the next palette.
 */
export const SPIDERVERSE_PALETTES: Array<{ name: string; stops: [string, string, string, string] }> = [
  { name: 'Miles', stops: ['#160a34', '#e01e5a', '#ff5ea8', '#48ecff'] },
  { name: 'Gwen', stops: ['#1a1030', '#ff4d8d', '#2fd6c9', '#f3ecff'] },
  { name: 'Classic', stops: ['#0a0a1a', '#d81e2c', '#ffd21e', '#ffffff'] },
  { name: 'Acid', stops: ['#06121a', '#7a2cff', '#17e0a0', '#d6ff3d'] },
  { name: 'Noir', stops: ['#050509', '#3a3f52', '#9aa3b8', '#ffffff'] },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Palette stops as flat [r,g,b] triples in 0..1. */
export function paletteStops(index: number): Array<[number, number, number]> {
  const p = SPIDERVERSE_PALETTES[index % SPIDERVERSE_PALETTES.length]!;
  return p.stops.map(hexToRgb);
}

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
  uniform float uReduced;
  uniform float uBeat;        // 0..1 beat pulse — pops the style
  uniform vec3  uPal[4];      // comic palette, dark -> light

  float lum3(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // Map a luminance to a flat comic fill from the current palette.
  vec3 paletteColor(float l) {
    float x = clamp(l, 0.0, 0.9999);
    int idx = int(floor(x * 4.0));
    if (idx <= 0) return uPal[0];
    if (idx == 1) return uPal[1];
    if (idx == 2) return uPal[2];
    return uPal[3];
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float mask = uHasPaint > 0.5 ? clamp(texture(uPaint, uv).r * uStrength, 0.0, 1.0) : 0.0;
    if (mask <= 0.003) { outputColor = inputColor; return; }

    // RGB "double vision" split — ghost the flat comic fills, punchier on a beat.
    float split = uSplit * (0.5 + 0.5 * mask) * (1.0 - uReduced * 0.6) * (1.0 + uBeat * 1.2);
    float lR = lum3(texture(inputBuffer, uv + vec2(split, split * 0.5)).rgb);
    float lG = lum3(inputColor.rgb);
    float lB = lum3(texture(inputBuffer, uv - vec2(split, split * 0.5)).rgb);
    vec3 comic = vec3(paletteColor(lR).r, paletteColor(lG).g, paletteColor(lB).b);

    // Chunky Ben-Day halftone dots, sized by local darkness. Beat boosts contrast.
    float ca = cos(0.4), sa = sin(0.4);
    vec2 rot = mat2(ca, -sa, sa, ca) * (uv * uResolution);
    float cell = max(uDotScale, 0.5) * 6.0;
    vec2 g2 = mod(rot, cell) - cell * 0.5;
    float dotR = cell * 0.5 * (0.30 + (1.0 - lG) * 0.70);
    float dotv = smoothstep(dotR, dotR - 2.0, length(g2));
    comic = mix(comic * (0.62 - uBeat * 0.1), comic * (1.15 + uBeat * 0.2), dotv);

    outputColor = vec4(mix(inputColor.rgb, comic, mask), inputColor.a);
  }
`;

export interface SpiderVerseOptions {
  dotScale?: number;
  split?: number;
  strength?: number;
}

/** Custom postprocessing effect for the Spider-Verse comic look. */
export class SpiderVerseEffect extends Effect {
  constructor(opts: SpiderVerseOptions = {}) {
    const c = { ...DEFAULT_SPIDERVERSE_CONFIG, ...opts };
    const pal0 = paletteStops(0).map(([r, g, b]) => new THREE.Vector3(r, g, b));
    super('SpiderVerseEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uPaint', new THREE.Uniform(FALLBACK_PAINT)],
        ['uHasPaint', new THREE.Uniform(0)],
        ['uStrength', new THREE.Uniform(c.strength)],
        ['uResolution', new THREE.Uniform(new THREE.Vector2(1280, 720))],
        ['uDotScale', new THREE.Uniform(c.dotScale)],
        ['uSplit', new THREE.Uniform(c.split)],
        ['uReduced', new THREE.Uniform(0)],
        ['uBeat', new THREE.Uniform(0)],
        ['uPal', new THREE.Uniform(pal0)],
      ]),
    });
  }

  /** Swap the active comic palette (0-based index into SPIDERVERSE_PALETTES). */
  setPalette(index: number): void {
    const stops = paletteStops(index);
    const pal = this.uniforms.get('uPal')!.value as THREE.Vector3[];
    for (let i = 0; i < 4; i++) pal[i]!.set(stops[i]![0], stops[i]![1], stops[i]![2]);
  }

  get uniformMap(): Map<string, THREE.Uniform> {
    return this.uniforms;
  }
}
