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

## AI pipeline (Milestone 7, currently mock)

`apps/ai-service` exposes provider-agnostic adapters behind `Protocol`
interfaces (scene analysis, layer proposal, segmentation, matting, depth,
completion). Only **mock** providers are implemented now; the factory selects
mock vs live by `AI_PROVIDER_MODE`. Long-running work is designed as async jobs —
no synchronous model calls inside request handlers. Original visible pixels are
always preserved; generative models only fill hidden/occluded regions.
