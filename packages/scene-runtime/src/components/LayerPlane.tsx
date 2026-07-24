'use client';

import {
  createPaperMaterial,
  createWaterMaterial,
  createWindMaterial,
  DEFAULT_PAPER_CONFIG,
  DEFAULT_WATER_CONFIG,
  DEFAULT_WIND_CONFIG,
  RippleManager,
  updateWaterUniforms,
  updateWindUniforms,
} from '@interactive-photo/effects';
import { getPresetEffects } from '@interactive-photo/presets';
import type { SceneLayer } from '@interactive-photo/scene-schema';
import { damp } from '@interactive-photo/shared';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useRuntime } from '../context';
import { planLayerEffects } from '../effects/layer-effects';
import {
  layerCenterWorld,
  layerDepthZ,
  layerPlaneSize,
  parallaxOffsetWorld,
  type Size,
} from '../math/coordinates';
import { useRuntimeStore } from '../store';

interface LayerPlaneProps {
  layer: SceneLayer;
  stage: Size;
  index: number;
  assetBaseUrl: string;
  /** Plain mode: unlit textured plane only — no wind/water/paper shader. */
  plain?: boolean;
}

/** Minimum seconds between drag-spawned ripples, so a drag doesn't flood the pool. */
const RIPPLE_DRAG_INTERVAL = 0.12;
/** Beat strength above which a (low-amplitude) ripple is spawned. */
const RIPPLE_BEAT_THRESHOLD = 0.75;
const RIPPLE_BEAT_INTERVAL = 0.5;

/**
 * A single photo layer rendered as an unlit textured plane.
 *
 * The material is chosen from the layer's tags via {@link planLayerEffects}:
 * plant layers get the wind shader, water layers get the ripple shader, and
 * everything else stays on a plain unlit material. In every case the original
 * photo pixels pass through unlit and un-tone-mapped. Transparent planes are
 * painted back-to-front via `renderOrder` with `depthWrite` off.
 */
export function LayerPlane({ layer, stage, index, assetBaseUrl, plain = false }: LayerPlaneProps) {
  const { preset, pointerRef, getAudioFrame } = useRuntime();
  const groupRef = useRef<THREE.Group>(null);
  const styleEngaged = useRuntimeStore((s) => s.styleEngaged);
  const styleList = useRuntimeStore((s) => s.styleList);
  const usedStyles = useRuntimeStore((s) => s.usedStyles);

  const url = assetBaseUrl + layer.assetUrl;
  const texture = useTexture(url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  const plan = useMemo(() => planLayerEffects(layer, preset), [layer, preset]);
  const presetFx = useMemo(() => getPresetEffects(preset.id), [preset.id]);

  // A stable per-layer phase offset so layers don't sway in lockstep.
  const seed = useMemo(
    () => [...layer.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 100,
    [layer.id],
  );

  const stageAspect = stage.width / Math.max(stage.height, 1e-6);

  /** The material for this layer, rebuilt only when the plan/texture changes. */
  const material = useMemo<THREE.Material>(() => {
    // Plain mode: an unlit textured plane, nothing else — no sway or ripple, just
    // the photo parallaxing. (The preset shader effects are kept for future use.)
    if (plain) {
      return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: layer.baseOpacity,
        depthWrite: false,
        toneMapped: false,
        side: THREE.FrontSide,
      });
    }
    if (plan.material === 'wind' && presetFx.wind?.enabled !== false) {
      return createWindMaterial(
        texture,
        { ...DEFAULT_WIND_CONFIG, ...presetFx.wind, stiffness: plan.windStiffness },
        seed,
        layer.baseOpacity,
      );
    }
    if (plan.material === 'water' && presetFx.water?.enabled !== false) {
      return createWaterMaterial(
        texture,
        { ...DEFAULT_WATER_CONFIG, ...presetFx.water },
        layer.baseOpacity,
        stageAspect,
      );
    }
    if (plan.material === 'paper' && presetFx.paper?.enabled !== false) {
      return createPaperMaterial(
        texture,
        { ...DEFAULT_PAPER_CONFIG, ...presetFx.paper },
        layer.baseOpacity,
      );
    }
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: layer.baseOpacity,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide,
    });
  }, [plain, plan.material, plan.windStiffness, presetFx, texture, seed, layer.baseOpacity, stageAspect]);

  // Dispose the previous material whenever it is replaced or we unmount.
  useEffect(() => () => material.dispose(), [material]);

  const isShader = material instanceof THREE.ShaderMaterial;
  const ripples = useMemo(() => new RippleManager(), []);
  const lastDragRipple = useRef(0);
  const lastBeatRipple = useRef(0);
  /**
   * Latest render-clock time. Ripple timestamps MUST come from the same clock the
   * shader's `uTime` uses, so we mirror it here for use in pointer handlers
   * (event `timeStamp` is a different time base and would look pre-decayed).
   */
  const clockRef = useRef(0);

  const center = useMemo(() => layerCenterWorld(layer, stage), [layer, stage]);
  const size = useMemo(() => layerPlaneSize(layer, stage), [layer, stage]);
  const z = useMemo(() => layerDepthZ(layer.depth), [layer.depth]);

  /** Spawn a ripple at a pointer event's UV (only for ripple-enabled layers). */
  const spawnRipple = (event: ThreeEvent<PointerEvent>, amplitude?: number) => {
    if (!plan.rippleEnabled || !event.uv) return;
    ripples.add([event.uv.x, event.uv.y], clockRef.current, amplitude ? { amplitude } : undefined);
  };

  useFrame((state, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;
    const { paused, reducedMotion } = useRuntimeStore.getState();
    if (paused) return;

    const dt = Math.min(rawDelta, 1 / 30);
    const time = state.clock.elapsedTime;
    clockRef.current = time;
    const pointer = pointerRef.current;
    // Convert normalized [0,1] pointer to centered [-1,1].
    const pc = { x: pointer.normalized.x * 2 - 1, y: pointer.normalized.y * 2 - 1 };
    const target = parallaxOffsetWorld(pc, layer, stage, preset.camera.parallaxStrength, reducedMotion);

    // Damp toward the target offset for smooth, frame-rate-independent motion.
    // Note: pointer y grows downward; negate so layers rise as the cursor rises.
    // Transform lives on the group so the base + styled overlay move together.
    group.position.x = damp(group.position.x, center.x + target.x, 6, dt);
    group.position.y = damp(group.position.y, center.y - target.y, 6, dt);

    // Subtle audio-reactive scale pulse, weighted by this layer's authored
    // sensitivity. Bounded so the subject never throbs distractingly.
    const frame = getAudioFrame();
    let targetScale = layer.baseScale;
    if (frame) {
      const s = layer.audioSensitivity;
      const energy = s.beat * frame.beatPulse + s.loudness * frame.loudness + s.bass * frame.bass;
      const pulse = (reducedMotion ? 0.25 : 1) * Math.min(energy, 1.5) * 0.03; // <=~4.5%
      targetScale = layer.baseScale * (1 + pulse);
    }
    const nextScale = damp(group.scale.x, targetScale, 8, dt);
    group.scale.setScalar(nextScale);

    if (!isShader) return;
    const shader = material as THREE.ShaderMaterial;

    if (plan.material === 'wind') {
      // Cursor UV: image space is top-down, UV is bottom-up.
      updateWindUniforms(shader, {
        time,
        cursorUv: { x: pointer.imageSpace.x, y: 1 - pointer.imageSpace.y },
        audioWind: frame ? Math.max(frame.lowMid, frame.bass) : 0,
        reducedMotion,
      });
    } else if (plan.material === 'water') {
      // Low-amplitude ripples on strong beats keep still water alive with music.
      if (
        frame &&
        frame.beatPulse > RIPPLE_BEAT_THRESHOLD &&
        time - lastBeatRipple.current > RIPPLE_BEAT_INTERVAL &&
        plan.rippleEnabled
      ) {
        lastBeatRipple.current = time;
        ripples.add([pointer.imageSpace.x, 1 - pointer.imageSpace.y], time, { amplitude: 0.004 });
      }
      ripples.prune(time);
      updateWaterUniforms(
        shader,
        time,
        ripples.active,
        reducedMotion,
        presetFx.water?.intensity ?? DEFAULT_WATER_CONFIG.intensity,
      );
    }
  });

  return (
    <group ref={groupRef} position={[center.x, center.y, z]} scale={layer.baseScale}>
      <mesh
        renderOrder={index}
        rotation={[0, 0, layer.baseRotation]}
        material={material}
        onPointerDown={(e) => spawnRipple(e)}
        onPointerMove={(e) => {
          // Slow drags trail ripples across the surface, rate-limited (render clock).
          if (!plan.rippleEnabled || !pointerRef.current.isDown) return;
          const t = clockRef.current;
          if (t - lastDragRipple.current < RIPPLE_DRAG_INTERVAL) return;
          lastDragRipple.current = t;
          spawnRipple(e, 0.008);
        }}
      >
        <planeGeometry args={[size.width, size.height]} />
      </mesh>

      {/* AI art-style reveal: each cursor stroke shows the style it was painted
          with (per-pixel style id from the paint field), masked by this layer's
          alpha. The base photo below stays pixel-sharp; style is "brushed in".
          Kept in the same group so it inherits depth + parallax. */}
      {styleEngaged &&
        usedStyles.map((styleId) => {
          const styleIndex = styleList.indexOf(styleId);
          if (styleIndex < 0) return null;
          return (
            <Suspense key={styleId} fallback={null}>
              <StyledOverlay
                styledUrl={`${assetBaseUrl}styles/${styleId}.png`}
                styleIndex={styleIndex}
                baseTexture={texture}
                size={size}
                renderOrder={index}
                rotation={layer.baseRotation}
                opacity={layer.baseOpacity}
              />
            </Suspense>
          );
        })}
    </group>
  );
}

interface StyledOverlayProps {
  /** Whole-frame styled photo for THIS style. */
  styledUrl: string;
  /** This style's index in the paint field's style-id channel. */
  styleIndex: number;
  baseTexture: THREE.Texture;
  size: Size;
  renderOrder: number;
  rotation: number;
  opacity: number;
}

const STYLE_REVEAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Show THIS style only where the paint field says this style owns the pixel.
// The paint field's R channel is strength, G is the style index — so one mesh
// per style keeps the shader trivial and imposes no limit on how many styles
// exist (no texture-unit ceiling). Styled PNGs are sRGB-encoded; convert to
// linear so the renderer's sRGB output re-encodes to the right colour.
const STYLE_REVEAL_FRAG = /* glsl */ `
  uniform sampler2D uStyled;
  uniform sampler2D uBase;
  uniform sampler2D uPaint;
  uniform float uOpacity;
  uniform float uStyleIndex;
  varying vec2 vUv;
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  void main() {
    vec2 pv = texture2D(uPaint, vUv).rg;
    if (abs(floor(pv.g + 0.5) - uStyleIndex) > 0.5) discard; // another style owns it
    float strength = clamp(pv.r, 0.0, 1.0);
    float baseA = texture2D(uBase, vUv).a;
    float a = baseA * strength * uOpacity;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(srgbToLinear(texture2D(uStyled, vUv).rgb), a);
  }
`;

/**
 * Reveals ONE painted art style over one layer. Pixels the cursor last painted
 * in a different style are discarded, so mounting one of these per style shows
 * every stroke in the style it was painted with — and the sharp original stays
 * visible everywhere the cursor hasn't brushed.
 */
function StyledOverlay({
  styledUrl,
  styleIndex,
  baseTexture,
  size,
  renderOrder,
  rotation,
  opacity,
}: StyledOverlayProps) {
  const { paintFieldRef } = useRuntime();
  const styled = useTexture(styledUrl);
  useMemo(() => {
    // Raw sampler read (we convert sRGB→linear in the shader), high anisotropy.
    styled.colorSpace = THREE.NoColorSpace;
    styled.anisotropy = 8;
    styled.needsUpdate = true;
  }, [styled]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STYLE_REVEAL_VERT,
        fragmentShader: STYLE_REVEAL_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          uStyled: { value: styled },
          uBase: { value: baseTexture },
          uPaint: { value: null },
          uOpacity: { value: opacity },
          uStyleIndex: { value: styleIndex },
        },
      }),
    [styled, baseTexture, opacity, styleIndex],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const field = paintFieldRef.current;
    material.uniforms.uPaint!.value = field ? field.texture : null;
    material.visible = field != null;
  });

  return (
    // Small z nudge so it sits just in front of the base at the same depth.
    <mesh
      renderOrder={renderOrder + 1}
      rotation={[0, 0, rotation]}
      position={[0, 0, 0.003]}
      material={material}
    >
      <planeGeometry args={[size.width, size.height]} />
    </mesh>
  );
}
