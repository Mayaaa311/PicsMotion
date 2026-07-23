# Milestone Plan & Status

| # | Milestone | Status |
|---|---|---|
| 0 | Foundation (monorepo, web, api, schemas, docker, lint, test, CI, assets) | ✅ done |
| 1 | Manual layer scene (loader, layers, depth, parallax, responsive, debug) | ✅ done |
| 2 | Audio engine | ⏳ next |
| 3 | Soft Nature effects (wind, fog, water, particles, sunlight) | ⏳ |
| 4 | Nostalgic + Dark | ⏳ |
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

## Verification notes

See `.claude/skill-audits/` for the Phase −1 bootstrap. Cross-language schema
validation is exercised by `packages/scene-schema` (Vitest) and
`apps/ai-service/tests` (Pytest), and the shipped `scene.json` is validated by
both `apps/web/tests/unit` and the Pydantic parser.
