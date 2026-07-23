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

## Style transfer

`app/stylize.py` restyles every layer PNG in a scene folder into one or more
art styles, writing outputs the web app reads directly from the scene
directory:

```
<sceneDir>/styles/<styleId>/<layerId>.png   # restyled layer, same size + alpha as the source
<sceneDir>/styles/manifest.json             # { generatedAt, provider, model, styles, layers }
```

Run it from `apps/ai-service` (mock mode, fully offline, no keys needed):

```bash
python -m app.stylize ../web/public/scenes/yosemite-falls
# or a subset of styles:
python -m app.stylize ../web/public/scenes/yosemite-falls spiderverse ink-sketch
```

The style catalog (`models/styles.py`) currently has five ids: `spiderverse`,
`watercolor`, `ink-sketch`, `pop-art`, `oil`. In `AI_PROVIDER_MODE=mock`
(the default) every style is produced by `MockStyleProvider`
(`models/style_providers.py`), a deterministic, no-network Pillow pipeline —
each style applies a distinct posterize/edge/blur/saturation transform and
always re-preserves the source layer's exact alpha channel.

Outputs are cached: a `<output>.sha` sidecar records
`sha256(input_bytes + styleId + model)`, so re-running the command only
regenerates layers whose source bytes, style, or model actually changed.

### Real AI styling

Set `AI_PROVIDER_MODE=live` plus a real key to use an actual image model
instead of the mock transform:

- `OPENAI_API_KEY` + `OPENAI_IMAGE_MODEL` (default `gpt-image-2`) routes
  through `OpenAIImageStyleProvider`, which calls
  `POST https://api.openai.com/v1/images/edits`. **The exact request/response
  shape was built against docs that were auth-gated at the time and must be
  re-verified against OpenAI's live documentation before production use.**
- Otherwise, `FAL_KEY` + `FAL_STYLE_MODEL` (default
  `fal-ai/flux/dev/image-to-image`) routes through `FalImg2ImgStyleProvider`,
  a generic fal queue (submit/poll/fetch) adapter. **This endpoint/schema is
  also unverified against live fal docs and is never exercised by the test
  suite** — treat it as a starting point, not a finished integration.
- If `AI_PROVIDER_MODE=live` but neither key is set, `get_style_provider`
  logs a warning and falls back to the mock provider rather than failing.

No model weights are downloaded and no real network call happens as a side
effect of importing `app.stylize` or `models.style_providers` — a real
provider is only constructed, and only makes a request, when
`stylize_scene`/`StyleProvider.stylize` is explicitly invoked in live mode.

## Docker

```bash
docker build -t picmotion-ai-service .
docker run --rm -p 8000:8000 picmotion-ai-service
```

The image runs as a non-root user and starts uvicorn on `0.0.0.0:8000` in mock
mode.

## Layout

```
app/          FastAPI app, config, in-memory job store, stylize CLI (app/stylize.py)
schemas/      Pydantic mirror of the shared TypeScript scene schema
models/       Provider Protocol interfaces, result types, provider factory,
              style catalog (models/styles.py) and style providers
              (models/style_providers.py: mock, OpenAI, fal)
pipelines/    Pipeline stages (scene_analysis, segmentation, matting,
              depth, inpainting, packaging) with mock providers
tests/        Offline pytest suite
```
