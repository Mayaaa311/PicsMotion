/**
 * StylePaintField — a persistent paint buffer that remembers, per pixel, WHICH
 * art style was last painted there and how strong that paint still is.
 *
 * The buffer is an RG(BA) half-float ping-pong pair in picture-UV space:
 *   R = paint strength (0..1), fades linearly to 0 over `lifetime` seconds.
 *   G = style index (0..N-1) of the last stroke that covered this pixel.
 *
 * Each frame:
 *   1. this frame's brush stamps are drawn additively into a coverage buffer;
 *   2. a combine pass fades the previous strength, raises it toward the new
 *      coverage, and — in the brush core — adopts the active style index.
 * So a new stroke only restyles the pixels it actually covers; everything the
 * cursor hasn't touched keeps the style (and strength) it already had. An
 * eraser mode (active style = "original") instead subtracts strength, revealing
 * the untouched photo again.
 *
 * NearestFilter is used so the style-index channel is never interpolated between
 * differently-styled regions (which would select a wrong style in the seam).
 */
import * as THREE from 'three';

// Fullscreen quad (geometry already spans clip space -1..1).
const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Stamp quad placed at a clip-space centre with a clip-space size (uniforms, not
// the model matrix, so each stamp lands exactly under the cursor).
const STAMP_VERT = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(uCenter + position.xy * uSize, 0.0, 1.0); }
`;

// Soft round brush → coverage in every channel (we read .r).
const STAMP_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(a);
  }
`;

// Combine: fade previous strength, merge this frame's coverage, adopt the active
// style id in the brush core (or erase strength when uErase is set). GLSL1.
const COMBINE_FRAG = /* glsl */ `
  uniform sampler2D uPrev;
  uniform sampler2D uCov;
  uniform float uDecay;
  uniform float uStyleIndex;
  uniform float uErase;
  varying vec2 vUv;
  void main() {
    vec4 prev = texture2D(uPrev, vUv);
    float cov = clamp(texture2D(uCov, vUv).r, 0.0, 1.0);
    float decayed = max(prev.r - uDecay, 0.0);
    if (uErase > 0.5) {
      gl_FragColor = vec4(max(decayed - cov, 0.0), prev.g, 0.0, 1.0);
    } else {
      // Ease-out so the stroke body reads boldly while the outer edge stays
      // soft (near 0 stays near 0), then keep the strongest paint seen so far.
      float body = cov * (2.0 - cov);
      float strength = max(decayed, body);
      // Adopt the new style only where this stroke actually covers (core),
      // so feathered edges keep whatever style was underneath.
      float adopt = step(0.35, cov);
      float styleId = mix(prev.g, uStyleIndex, adopt);
      gl_FragColor = vec4(strength, styleId, 0.0, 1.0);
    }
  }
`;

export interface StampPoint {
  x: number;
  y: number;
}

export class StylePaintField {
  private readonly size: number;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private cov: THREE.WebGLRenderTarget;
  private current: THREE.WebGLRenderTarget;

  private readonly combineScene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly combineMat: THREE.ShaderMaterial;
  private readonly stampMat: THREE.ShaderMaterial;
  private readonly combineQuad: THREE.Mesh;
  private readonly stampMesh: THREE.Mesh;
  private inited = false;

  constructor(size = 1024) {
    this.size = size;
    // Nearest filtering on the state buffers keeps the style-index channel from
    // being interpolated between regions painted in different styles.
    const stateOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.a = new THREE.WebGLRenderTarget(size, size, stateOpts);
    this.b = new THREE.WebGLRenderTarget(size, size, stateOpts);
    this.cov = new THREE.WebGLRenderTarget(size, size, {
      ...stateOpts,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.current = this.a;

    this.combineMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMBINE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uCov: { value: null },
        uDecay: { value: 0 },
        uStyleIndex: { value: 0 },
        uErase: { value: 0 },
      },
    });
    this.combineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.combineMat);
    this.combineQuad.frustumCulled = false;
    this.combineScene.add(this.combineQuad);

    this.stampMat = new THREE.ShaderMaterial({
      vertexShader: STAMP_VERT,
      fragmentShader: STAMP_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uCenter: { value: new THREE.Vector2() }, uSize: { value: 0.1 } },
    });
    this.stampMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.stampMat);
    this.stampMesh.frustumCulled = false;
    this.stampScene.add(this.stampMesh);
  }

  /** Current paint state texture (rg = strength, styleIndex) to sample. */
  get texture(): THREE.Texture {
    return this.current.texture;
  }

  private clearAll(gl: THREE.WebGLRenderer): void {
    const prev = gl.getRenderTarget();
    for (const rt of [this.a, this.b, this.cov]) {
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
    }
    gl.setRenderTarget(prev);
    this.inited = true;
  }

  /**
   * Advance one frame.
   * @param dt seconds since last frame (already clamped by the caller)
   * @param stamps brush stamp centres this frame, in picture UV [0,1]
   * @param lifetime seconds for a full-strength stroke to fade to zero
   * @param stampRadius stamp radius in UV
   * @param styleIndex active style index to paint (ignored when erasing)
   * @param erase true = eraser (reveal the original photo)
   */
  update(
    gl: THREE.WebGLRenderer,
    dt: number,
    stamps: readonly StampPoint[],
    lifetime: number,
    stampRadius: number,
    styleIndex: number,
    erase: boolean,
  ): void {
    if (!this.inited) this.clearAll(gl);

    const read = this.current;
    const write = this.current === this.a ? this.b : this.a;

    const prevRT = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;

    // 1) accumulate this frame's stamps into the coverage buffer (cleared first).
    gl.setRenderTarget(this.cov);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    if (stamps.length > 0) {
      this.stampMat.uniforms.uSize!.value = stampRadius * 4; // uv radius r → clip 4r
      const center = this.stampMat.uniforms.uCenter!.value as THREE.Vector2;
      for (const p of stamps) {
        center.set(p.x * 2 - 1, p.y * 2 - 1);
        gl.render(this.stampScene, this.cam);
      }
    }

    // 2) combine faded previous state + coverage → next state.
    this.combineMat.uniforms.uPrev!.value = read.texture;
    this.combineMat.uniforms.uCov!.value = this.cov.texture;
    this.combineMat.uniforms.uDecay!.value = dt / Math.max(lifetime, 0.001);
    this.combineMat.uniforms.uStyleIndex!.value = styleIndex;
    this.combineMat.uniforms.uErase!.value = erase ? 1 : 0;
    gl.setRenderTarget(write);
    gl.render(this.combineScene, this.cam);

    gl.setRenderTarget(prevRT);
    gl.autoClear = prevAutoClear;
    this.current = write;
  }

  /** Wipe all paint. */
  reset(gl: THREE.WebGLRenderer): void {
    this.clearAll(gl);
    this.current = this.a;
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
    this.cov.dispose();
    this.combineMat.dispose();
    this.stampMat.dispose();
    (this.combineQuad.geometry as THREE.BufferGeometry).dispose();
    (this.stampMesh.geometry as THREE.BufferGeometry).dispose();
  }
}
