# Milestone Plan & Status

| # | Milestone | Status |
|---|---|---|
| 0 | Foundation (monorepo, web, api, schemas, docker, lint, test, CI, assets) | ✅ done |
| 1 | Manual layer scene (loader, layers, depth, parallax, responsive, debug) | ✅ done |
| 2 | Audio engine | ✅ done |
| 3 | Soft Nature effects (wind, fog, water, particles, sunlight) | ✅ done |
| 4 | Nostalgic + Dark (+ postprocessing pipeline) | ✅ done |
| 5 | Urban (physics/inertia) — Electronic merged in | ⏳ next |

> **Preset rework (user direction, 2026-07-23):** preset set reduced to **4**
> (Electronic merged into Urban). Soft Nature fog is now interactive (cursor =
> wind, shaped clear-spots that return gradually); Urban gained a **Spider-Verse**
> comic effect (halftone + RGB-split splashes along the cursor path); Nostalgic
> gained a **dwell-halo** (warm light builds where the cursor rests, fades when it
> leaves); Dark kept. See `packages/effects/{fog,spiderverse,halo}`.
| 6 | Manual scene editor | ⏳ |
| 7 | Hosted automatic parsing & completion (real providers) | ⏳ in progress — per-layer **style transfer** landed (mock + OpenAI/fal adapters, `python -m app.stylize`); scene analysis / segmentation / matting / depth / inpainting still mock |
| 8 | Publishing | ⏳ |

## Milestone 0 — Definition of Done

- [x] Monorepo (pnpm workspaces), Next.js web app, FastAPI ai-service.
- [x] Shared scene schema validated in **TypeScript (Zod)** and **Python (Pydantic)**.
- [x] Docker Compose (web, ai-service, postgres, redis, minio).
- [x] Linting (ESLint/Prettier/Ruff), type checking (tsc/mypy), tests (Vitest/Pytest).
- [x] GitHub Actions CI (secret scan, web typecheck/lint/test/build, e2e, python lint/type/test).
- [x] Sample assets (procedural Soft Nature layers).
- [x] README with exact setup commands.

## Milestone 1 — Definition of Done

- [x] Scene loader + Zod validation.
- [x] Layer plane rendering (unlit, original pixels preserved, alpha-correct).
- [x] Depth ordering + depth-aware, clamped pointer parallax.
- [x] Responsive contain-fit canvas (portrait/landscape/mobile stable).
- [x] Loading progress state.
- [x] Quality settings (DPR clamp per tier) + reduced-motion + pause-on-hide.
- [x] Debug panel (FPS, pointer coords, layer depth, active preset, quality).
- [x] Unit tests + Playwright smoke test.

## Milestone 2 — Definition of Done

- [x] Audio upload (own file) **and** demo-library tracks via `AudioSourceAdapter`
      (`UploadedAudioAdapter`, `LicensedLibraryAdapter`, placeholder `SpotifyPlaybackAdapter`).
- [x] Playback: play / pause / seek / mute / volume, with autoplay-safe
      `AudioContext` resume on a user gesture, and deterministic `dispose()`.
- [x] Real-time frequency analysis → normalized bands (bass / lowMid / highMid /
      treble / loudness) plus `spectralFlux`.
- [x] Beat detection (adaptive threshold + min inter-beat interval) → `beat`
      events and a decaying `beatPulse`.
- [x] Attack/release smoothing so effects rise fast and decay smoothly.
- [x] Scene receives **normalized values only** — the runtime calls
      `getAudioFrame()` and never touches an `AnalyserNode`.
- [x] Declarative mapping: `audioBindings` in `scene.json`
      (`bass → camera.zoom`, `beatPulse → camera.push`) plus per-layer
      `audioSensitivity`, all clamped.
- [x] Unit tests for the pure DSP, beat detector and binding evaluation (28 in
      audio-engine, 4 more in scene-runtime).

### Audio: what is NOT included yet
- Offline/Essentia.js section analysis (`section-change` events) — the
  `AudioSection` type exists but no offline analyser is wired.
- Preset-specific audio→visual identity (wind, fog, bloom, flashlight…) — that
  is Milestones 3–5. Today audio drives a subtle camera push + per-layer pulse.

## Milestone 3 — Definition of Done

- [x] `packages/effects`: wind material, fog planes, particle field, sunlight glow,
      water ripple manager+material — each with typed config, `DEFAULT_*`,
      intensity clamp, reduced-motion behaviour, quality awareness, documented
      uniforms, deterministic cleanup, and no per-frame allocation / shader recompile.
- [x] Wind: base anchored (UV-height bend weight), bends away from cursor, plus
      procedural + audio sway; subject stiffer than foreground via `planLayerEffects`.
- [x] Fog: 2–3 depth-distributed noise planes, slow drift, bass-reactive density.
- [x] Water: bounded ripple pool (max 8), pointer click + slow-drag + strong-beat
      ripples, decays back to still.
- [x] Particles: pooled buffers, wrapping drift, treble-reactive brightness.
- [x] Sunlight: smoothed loudness+beat envelope, hard-capped brightness (never full).
- [x] Presets configure effects (`presetEffects`); the runtime reads config and
      never branches on preset name. Soft Nature is now visually distinct.
- [x] Tests: 26 in effects/scene-runtime effect logic (wind bend, ripple pool,
      layer-effect planning); build + 6 e2e green.

### Not included yet
- Preset *identities* for Dark/Urban/Electronic/Nostalgic are still restrained
  (their signature effects are Milestones 4–5); only ambient fog/particles differ today.
- No postprocessing pipeline (bloom/vignette/grain/aberration) yet — Milestone 4/5.

## Milestone 4 — Definition of Done

- [x] **Postprocessing pipeline** (`packages/effects/postfx.tsx`) over
      @react-three/postprocessing: bloom, vignette, film grain, chromatic
      aberration, sepia/brightness/contrast/saturation grade. Bloom (audio) and
      aberration (pointer) update per-frame via refs; the rest are static props.
      Pure, tested `resolvePostFX` folds audio/pointer/reduced-motion into clamped
      intensities.
- [x] **Dark**: custom `FlashlightEffect` — darkened scene with a noisy radial
      reveal following the smoothed cursor (irregular edge, frozen under reduced
      motion) + heavy vignette + desaturation.
- [x] **Nostalgic**: `createPaperMaterial` — cream rim traced around the alpha
      silhouette, warm tint, inner-edge thickness + sepia/grain/vignette grade.
      (Applied when the preset's pointer mode is `lift`.)
- [x] Camera drift (`AudioCameraController`) scaled by `camera.driftStrength`.
- [x] All five presets now have a distinct visual identity; the runtime reads
      `presetEffects[preset].post` and never branches on preset name.
- [x] Reduced motion damps reactive additions and freezes the flashlight edge.
- [x] Tests: 96 unit (incl. `resolvePostFX`); build + 7 e2e (a cycle through all
      five presets asserts no console/WebGL errors).

### Not included yet
- Full drag-to-lift physics for Nostalgic (spring return, surrounding-layer
  damping) is Milestone 5 (interaction-physics); today the paper look is static.
- Dark "hidden detail" reveal-only layers are not wired (no `HiddenDetail` in the
  schema yet).

## Verification notes

See `.claude/skill-audits/` for the Phase −1 bootstrap. Cross-language schema
validation is exercised by `packages/scene-schema` (Vitest) and
`apps/ai-service/tests` (Pytest), and the shipped `scene.json` is validated by
both `apps/web/tests/unit` and the Pydantic parser.
