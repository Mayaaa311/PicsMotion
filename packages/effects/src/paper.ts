/**
 * Paper-cutout material (Nostalgic preset).
 *
 * Renders a layer as if it were a printed cutout: a cream rim traced around the
 * alpha edge, a subtle warm tint, and a soft inner-edge darkening for a hint of
 * thickness. The rim is found by comparing each pixel's alpha to the max alpha
 * of a small ring of neighbours (a cheap dilation), so it follows the cutout's
 * real silhouette rather than a rectangle.
 *
 * Uniforms
 *  uMap          sampler2D  layer texture
 *  uOpacity      float      layer base opacity
 *  uTexel        vec2       1/resolution, for neighbour taps
 *  uBorderWidth  float      rim width in texels
 *  uBorderColor  vec3       cream rim colour
 *  uWarm         float      warm-tint amount (0..1)
 *  uThickness    float      inner-edge darkening amount (0..1)
 */
import { clamp } from '@interactive-photo/shared';
import * as THREE from 'three';

export interface PaperConfig {
  enabled: boolean;
  intensity: number;
  borderWidthPx: number;
  borderColor: string;
  warm: number;
  thickness: number;
}

export const DEFAULT_PAPER_CONFIG: PaperConfig = {
  enabled: true,
  intensity: 1,
  borderWidthPx: 6,
  borderColor: '#f6efe0',
  warm: 0.5,
  thickness: 0.35,
};

const PAPER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PAPER_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec2  uTexel;
  uniform float uBorderWidth;
  uniform vec3  uBorderColor;
  uniform float uWarm;
  uniform float uThickness;
  varying vec2 vUv;

  float sampleA(vec2 uv) { return texture2D(uMap, clamp(uv, 0.0, 1.0)).a; }

  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a;

    // Cheap dilation: max alpha over an 8-direction ring at the border radius.
    vec2 o = uTexel * uBorderWidth;
    float dmax = a;
    dmax = max(dmax, sampleA(vUv + vec2( o.x, 0.0)));
    dmax = max(dmax, sampleA(vUv + vec2(-o.x, 0.0)));
    dmax = max(dmax, sampleA(vUv + vec2(0.0,  o.y)));
    dmax = max(dmax, sampleA(vUv + vec2(0.0, -o.y)));
    dmax = max(dmax, sampleA(vUv + vec2( o.x,  o.y)));
    dmax = max(dmax, sampleA(vUv + vec2(-o.x,  o.y)));
    dmax = max(dmax, sampleA(vUv + vec2( o.x, -o.y)));
    dmax = max(dmax, sampleA(vUv + vec2(-o.x, -o.y)));

    // Warm tint of the original pixels.
    vec3 warm = t.rgb * mix(vec3(1.0), vec3(1.08, 1.02, 0.9), uWarm);

    // Inner-edge darkening (thickness) where the shape starts to fade.
    float inner = smoothstep(0.0, 1.0, a);
    warm *= mix(1.0, 0.82, uThickness * (1.0 - inner));

    // Rim: pixels outside the shape (low a) but adjacent to it (high dmax).
    float rim = clamp(dmax - a, 0.0, 1.0);
    vec3 color = mix(warm, uBorderColor, rim);
    float alpha = max(a, rim) * uOpacity;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

/** Build the paper-cutout material for a layer (once; never per frame). */
export function createPaperMaterial(
  map: THREE.Texture,
  config: PaperConfig,
  opacity = 1,
): THREE.ShaderMaterial {
  const w = map.image?.width ?? 1024;
  const h = map.image?.height ?? 1024;
  const intensity = clamp(config.intensity, 0, 1);
  return new THREE.ShaderMaterial({
    vertexShader: PAPER_VERTEX,
    fragmentShader: PAPER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: opacity },
      uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      uBorderWidth: { value: config.borderWidthPx },
      uBorderColor: { value: new THREE.Color(config.borderColor) },
      uWarm: { value: config.warm * intensity },
      uThickness: { value: config.thickness * intensity },
    },
  });
}
