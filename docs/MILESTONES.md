# Milestone Plan & Status

| # | Milestone | Status |
|---|---|---|
| 0 | Foundation (monorepo, web, api, schemas, docker, lint, test, CI, assets) | ✅ done |
| 1 | Manual layer scene (loader, layers, depth, parallax, responsive, debug) | ✅ done |
| 2 | Audio engine | ✅ done |
| 3 | Soft Nature effects (wind, fog, water, particles, sunlight) | ✅ done |
| 4 | Nostalgic + Dark | ⏳ next |
| 5 | Urban + Electronic (inertia, impulses, physics, aberration, trails) | ⏳ |
| 6 | Manual scene editor | ⏳ |
| 7 | Hosted automatic parsing & completion (real providers) | ⏳ (mock scaffolding in place) |
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

## Verification notes

See `.claude/skill-audits/` for the Phase −1 bootstrap. Cross-language schema
validation is exercised by `packages/scene-schema` (Vitest) and
`apps/ai-service/tests` (Pytest), and the shipped `scene.json` is validated by
both `apps/web/tests/unit` and the Pydantic parser.
