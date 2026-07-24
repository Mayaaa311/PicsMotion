# Interactive Photo

Turn a single photograph into a layered, depth-aware, music-responsive 2.5D experience.
One reusable scene engine, five configurable interaction presets.

> **Status:** Milestones 0–1 complete (foundation + manual-layer scene runtime).
> AI parsing (Milestone 7) is stubbed with mock providers; **no paid AI calls are
> made** in this build.

## Quick start

Prerequisites: **Node ≥ 18.18** (20 recommended), **pnpm 9**, **Python 3.11+**.

```bash
# 1. Install JS workspace deps
pnpm install

# 2. Copy env template (mock mode — no real keys needed for M0–M5)
cp .env.example .env

# 3. Run the web app  → http://127.0.0.1:3000
pnpm dev
# open http://127.0.0.1:3000/demo/soft-nature
```

Run the AI service (optional for M1; needed later):

```bash
cd apps/ai-service
python3 -m venv .venv && . .venv/bin/activate   # see note below if venv is unavailable
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload        # http://127.0.0.1:8000/health
```

Full stack via Docker:

```bash
cp .env.example .env
docker compose up --build     # web:3000  ai-service:8000  postgres  redis  minio
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the Next.js web app |
| `pnpm build` | Build all packages + web |
| `pnpm typecheck` | Type-check every workspace package |
| `pnpm lint` | Lint |
| `pnpm test` | Unit tests (Vitest) across packages + web |
| `pnpm test:e2e` | Playwright smoke/regression tests |
| `pnpm check:secrets` | Scan tracked files for likely secrets (masked output) |
| `pnpm provider:doctor` | Report AI provider readiness (no secrets printed) |
| `python scripts/gen-sample-scene.py` | Regenerate the placeholder Soft Nature assets |

## Monorepo layout

```
apps/
  web/          Next.js App Router frontend (the application shell + demo)
  ai-service/   FastAPI provider-orchestration backend (mock providers for now)
packages/
  scene-schema/ Zod scene contract (mirrored by ai-service Pydantic models)
  scene-runtime/ Reusable <InteractiveScene/> R3F engine (layers, parallax, debug)
  presets/      Five serializable interaction presets + merge logic
  shared/       Pure math/constants
  effects/ audio-engine/ interaction-engine/ editor-ui/   (later milestones)
scripts/        check-secrets.sh, provider-doctor.py, gen-sample-scene.py
infrastructure/ docker + CI helpers
docs/           provider setup, cost control, privacy, architecture
```

## Security

- **No real secrets in the repo.** `.env*` is git-ignored; `.env.example` holds placeholders only.
- `scripts/check-secrets.sh` runs in CI and can be used as a pre-commit check.
- The permanent `FAL_KEY`/provider keys are **server-side only** and never reach the browser.
- If a key is exposed, rotate it before enabling live providers. See [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the engine and pipeline fit together
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — provider setup & the mock/live modes
- [docs/COST_CONTROLS.md](docs/COST_CONTROLS.md) — keeping AI spend bounded
- [docs/PRIVACY.md](docs/PRIVACY.md) — data retention & privacy
- [docs/MILESTONES.md](docs/MILESTONES.md) — milestone plan & current status
