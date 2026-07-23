/**
 * PaintAccumulator — a persistent paint buffer for the Spider-Verse effect.
 *
 * A ping-pong pair of float render targets. Each frame:
 *   1. the previous buffer is copied into the next with a tiny diffusion blur
 *      (so older paint spreads/softens) and a LINEAR decay subtracted (so a
 *      stroke fades to nothing over `lifetime` seconds — ~1 minute), then
 *   2. new stamps are added additively on top.
 * The buffer is only ever cleared once (at init), so paint persists for its full
 * lifetime regardless of how much is drawn — constant per-frame cost.
 *
 * Half-float targets are used so the small per-frame decay doesn't get stuck on
 * 8-bit rounding.
 */
import * as THREE from 'three';

// Fullscreen quad (geometry already spans clip space -1..1).
const COPY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Stamp quad placed at a clip-space centre with a clip-space size. Uses uniforms
// (NOT the model matrix) so each stamp lands exactly under the cursor.
const STAMP_VERT = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(uCenter + position.xy * uSize, 0.0, 1.0); }
`;

// Very gentle diffuse (mostly identity so paint stays STRONG for its full life)
// + linear decay. Heavy per-frame blur compounds 60x/sec and washes paint out,
// so the centre weight is kept near 1. GLSL1 (texture2D / gl_FragColor).
const FADE_FRAG = /* glsl */ `
  uniform sampler2D tPrev;
  uniform vec2 uTexel;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tPrev, vUv) * 0.94;
    c += texture2D(tPrev, vUv + vec2(uTexel.x, 0.0)) * 0.015;
    c += texture2D(tPrev, vUv - vec2(uTexel.x, 0.0)) * 0.015;
    c += texture2D(tPrev, vUv + vec2(0.0, uTexel.y)) * 0.015;
    c += texture2D(tPrev, vUv - vec2(0.0, uTexel.y)) * 0.015;
    gl_FragColor = max(c - uDecay, 0.0);
  }
`;

const STAMP_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(a, a, a, a);
  }
`;

export interface StampPoint {
  x: number;
  y: number;
}

export class PaintAccumulator {
  private readonly size: number;
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private current: THREE.WebGLRenderTarget;

  private readonly scene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fadeMat: THREE.ShaderMaterial;
  private readonly stampMat: THREE.ShaderMaterial;
  private readonly fadeQuad: THREE.Mesh;
  private readonly stampMesh: THREE.Mesh;
  private inited = false;

  constructor(size = 1024) {
    this.size = size;
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.a = new THREE.WebGLRenderTarget(size, size, opts);
    this.b = new THREE.WebGLRenderTarget(size, size, opts);
    this.current = this.a;

    this.fadeMat = new THREE.ShaderMaterial({
      vertexShader: COPY_VERT,
      fragmentShader: FADE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
        uDecay: { value: 0 },
      },
    });
    this.fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMat);
    this.fadeQuad.frustumCulled = false;
    this.scene.add(this.fadeQuad);

    this.stampMat = new THREE.ShaderMaterial({
      vertexShader: STAMP_VERT,
      fragmentShader: STAMP_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uSize: { value: 0.1 },
      },
    });
    this.stampMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.stampMat);
    this.stampMesh.frustumCulled = false;
    this.stampScene.add(this.stampMesh);
  }

  /** Current paint texture to sample in the effect. */
  get texture(): THREE.Texture {
    return this.current.texture;
  }

  private clearBoth(gl: THREE.WebGLRenderer): void {
    const prev = gl.getRenderTarget();
    for (const rt of [this.a, this.b]) {
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
    }
    gl.setRenderTarget(prev);
    this.inited = true;
  }

  /**
   * Advance one frame: fade+diffuse the buffer, then add `stamps`.
   * @param dt seconds since last frame (already clamped by the caller)
   * @param lifetime seconds for a full-strength stroke to fade to zero
   * @param stampRadius stamp radius in UV
   */
  update(
    gl: THREE.WebGLRenderer,
    dt: number,
    stamps: readonly StampPoint[],
    lifetime: number,
    stampRadius: number,
  ): void {
    if (!this.inited) this.clearBoth(gl);

    const read = this.current;
    const write = this.current === this.a ? this.b : this.a;

    const prevRT = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;

    // 1) fade + diffuse read -> write
    this.fadeMat.uniforms.tPrev!.value = read.texture;
    this.fadeMat.uniforms.uDecay!.value = dt / Math.max(lifetime, 0.001);
    gl.setRenderTarget(write);
    gl.render(this.scene, this.cam);

    // 2) additive stamps into write, each placed under the cursor via uniforms
    if (stamps.length > 0) {
      // uv radius r → clip half-size 2r; geometry is 1u so uSize = 4r.
      this.stampMat.uniforms.uSize!.value = stampRadius * 4;
      const center = this.stampMat.uniforms.uCenter!.value as THREE.Vector2;
      for (const p of stamps) {
        center.set(p.x * 2 - 1, p.y * 2 - 1);
        gl.render(this.stampScene, this.cam);
      }
    }

    gl.setRenderTarget(prevRT);
    gl.autoClear = prevAutoClear;
    this.current = write;
  }

  /** Wipe all paint (e.g. on preset change). */
  reset(gl: THREE.WebGLRenderer): void {
    this.clearBoth(gl);
    this.current = this.a;
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
    this.fadeMat.dispose();
    this.stampMat.dispose();
    (this.fadeQuad.geometry as THREE.BufferGeometry).dispose();
    (this.stampMesh.geometry as THREE.BufferGeometry).dispose();
  }
}
