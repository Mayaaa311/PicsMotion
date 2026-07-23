# ai-service

API-first AI backend for the PicMotion interactive photo-to-music app
(Milestone 0). Runs CPU-only and offline in **mock mode** by default — no GPU,
no model weights, no network calls, and no API keys required.

## Requirements

- Python 3.11+ (developed against 3.12)

## Setup

```bash
cd apps/ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

## Run the service

```bash
uvicorn app.main:app --reload
```

The service starts on <http://127.0.0.1:8000>. Interactive API docs are at
`/docs`.

## Run the tests

```bash
pytest -q
```

All tests pass offline with no environment variables set.

## Lint and type-check

```bash
ruff check .
mypy .
```

## Mock mode

`AI_PROVIDER_MODE` controls provider selection (default `mock`). In mock mode:

- `models/factory.py` returns deterministic mock providers
  (`MockSceneAnalysisProvider`, `MockSegmentationProvider`, `MockDepthProvider`,
  `MockCompletionProvider`) that return canned data with no network access.
- `required_providers_for_mode()` returns an empty list, so `/ready` and
  `/providers` report the service as ready with no keys present.
- Requesting a real provider (`AI_PROVIDER_MODE=live`) raises
  `NotImplementedError` — real providers arrive in later milestones.

Configuration is read from environment variables (or a local `.env`) via
`app/config.py`. Secret values are **never** returned raw; the `/providers`
endpoint masks them.

## Endpoints

| Method | Path                            | Description                                   |
| ------ | ------------------------------- | --------------------------------------------- |
| GET    | `/health`                       | Liveness probe — `{"status": "healthy"}`.     |
| GET    | `/ready`                        | Readiness with dependency checks.             |
| GET    | `/providers`                    | Provider config report (secrets masked).      |
| POST   | `/pipeline/jobs`                | Create a mock pipeline job (`{imageUrl}`).    |
| GET    | `/pipeline/jobs/{job_id}`       | Poll job status / stage / progress.           |
| POST   | `/pipeline/jobs/{job_id}/cancel`| Cancel a job.                                 |

The mock pipeline job advances one stage each time it is polled
(`queued → scene_analysis → … → packaging → completed`), so a client can
exercise the full create/poll/complete flow offline.

## Docker

```bash
docker build -t picmotion-ai-service .
docker run --rm -p 8000:8000 picmotion-ai-service
```

The image runs as a non-root user and starts uvicorn on `0.0.0.0:8000` in mock
mode.

## Layout

```
app/          FastAPI app, config, in-memory job store
schemas/      Pydantic mirror of the shared TypeScript scene schema
models/       Provider Protocol interfaces, result types, provider factory
pipelines/    Pipeline stages (scene_analysis, segmentation, matting,
              depth, inpainting, packaging) with mock providers
tests/        Offline pytest suite
```
