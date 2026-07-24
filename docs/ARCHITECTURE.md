# Architecture

## Principle: one engine, five presets

There is a single scene runtime (`packages/scene-runtime`). Presets
(`packages/presets`) are serializable configuration objects that tune pointer
behavior, camera response, particles and postprocessing. The runtime never
branches on preset name — it reads preset values. A scene may override individual
preset properties via `presetOverride`.

## The scene contract

`packages/scene-schema` is the single source of truth for the scene data model,
defined with **Zod**. `apps/ai-service/schemas/scene.py` mirrors it with **Pydantic
v2** (identical camelCase field names, matching validators). Both reject malformed
scenes with readable errors. The shipped sample (`apps/web/public/scenes/
soft-nature-demo/scene.json`) is validated by both in tests.

## Runtime data flow (Milestone 1)

```
scene.json ──loadScene()──▶ Zod validate ──▶ <InteractiveScene>
                                              │
     pointer events ─▶ usePointerField (refs, rAF; no React state)
                                              │
     useFrame (hot path) ─▶ parallaxOffsetWorld() ─▶ mesh.position (damped)
                                              │
     FrameReporter (5 Hz) ─▶ zustand debug store ─▶ <DebugPanel> (DOM)
```

Key performance choices (see `docs`/spec §20):

- Pointer state lives in a **ref**, updated on events + a rAF smoother — never
  React state, so no re-render per move.
- Per-frame work happens in `useFrame`; parallax offsets are damped
  frame-rate-independently and **clamped** by each layer's authored `maxOffset`
  and its `revealBudget` (so we never expose unreconstructed pixels).
- Debug values are mirrored into a Zustand store at ~5 Hz for the DOM overlay.
- Rendering **pauses** when the tab is hidden; DPR is clamped per quality tier.
- Photo layers use an unlit `meshBasicMaterial` with `toneMapped={false}` so the
  **original pixels are shown unchanged** — a core product rule.

## Layer compositing

Layers are full-frame, pixel-aligned RGBA planes stacked by depth. They render
back-to-front (`renderOrder` by sorted depth) with `depthWrite=false` to avoid
halos and z-fighting. The stage is sized "contain" so composition is stable
across portrait/landscape and any viewport.

## Audio (Milestone 2)

`packages/audio-engine` is independent of all rendering code:

```
source (uploaded File | library URL)
   └─ AudioSourceAdapter ──▶ HTMLAudioElement
                               └─ MediaElementSource ─▶ AnalyserNode ─▶ Gain ─▶ out
                                                            │
        engine rAF loop: computeBands → attack/release smoothing
                         spectralFlux → BeatDetector → beatPulse decay
                                                            │
                                              AudioFrame (mutated in place)
                                                            │
   scene: getAudioFrame() ──▶ AudioCameraController (clamped camera push)
                         └──▶ LayerPlane (per-layer audioSensitivity pulse)
```

Key rules:
- All DSP is **pure** (`dsp.ts`, `beat-detector.ts`, `bindings.ts`) so it is unit
  tested with synthetic arrays — no real `AudioContext` in tests.
- The renderer consumes **normalized `AudioFrame` values only**; it never queries
  an `AnalyserNode` (spec §9).
- `getAudioFrame()` returns `null` until a source is analysable, so the runtime
  skips audio work entirely rather than reacting to zeroed data.
- The frame object is mutated in place — no per-frame allocation in the hot path.
- Audio response is clamped everywhere (camera push ≤ 0.5 world units, layer
  pulse ≤ ~4.5% scale) and attenuated under reduced motion.
- Spotify is a **placeholder adapter only** (`supportsSignalAnalysis = false`);
  the core audio-reactive engine never depends on it (spec §19).

## Effects (Milestone 3)

`packages/effects` holds reusable, framework-light effect modules; presets only
*configure* them and the runtime never branches on preset name:

- **Material selection** — `planLayerEffects(layer, preset)` maps a layer's tags,
  role and importance to a material kind (`basic | wind | water`) and a wind
  stiffness. `LayerPlane` builds the matching material once (never per frame) and
  updates uniforms via refs.
- **Wind** (`wind.ts`) — vertex shader bends plant layers away from the cursor with
  a UV-height bend weight so the base stays anchored; procedural + audio sway. The
  GLSL math is mirrored by the pure, unit-tested `computeBendAmount`.
- **Fog / particles / sunlight** (`.tsx`) — R3F components mounted by `SceneContent`
  from the preset's effect config; all read audio via `getAudioFrame()`.
- **Water** (`water.ts`) — a bounded `RippleManager` (≤ 8 ripples) feeds a fragment
  shader that offsets UV sampling by summed decaying radial waves; ripples come
  from pointer clicks, slow drags and strong beats.

Every effect clamps its intensity, attenuates under reduced motion, disposes its
GPU resources on unmount, and never recompiles a shader in response to
pointer/audio updates.

### Postprocessing (Milestone 4)

`PostFX` wraps a single `EffectComposer` mounted once inside the Canvas. Each
preset supplies a `PostFXConfig` (`presetEffects[preset].post`); the pure
`resolvePostFX` folds audio (bloom), pointer speed (aberration) and reduced motion
into clamped intensities. Static effects are passed as props; only bloom intensity
and the aberration offset are mutated per frame via refs. A custom
`FlashlightEffect` (darken + noisy radial reveal at the cursor) powers Dark; the
`createPaperMaterial` cutout (cream rim + warm tint) powers Nostalgic. This is the
layer where the five presets finally diverge visually.

## AI pipeline (Milestone 7, currently mock)

`apps/ai-service` exposes provider-agnostic adapters behind `Protocol`
interfaces (scene analysis, layer proposal, segmentation, matting, depth,
completion). Only **mock** providers are implemented now; the factory selects
mock vs live by `AI_PROVIDER_MODE`. Long-running work is designed as async jobs —
no synchronous model calls inside request handlers. Original visible pixels are
always preserved; generative models only fill hidden/occluded regions.
