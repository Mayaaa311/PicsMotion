# Providers

The app talks to hosted AI providers through **adapters**; vendor calls are never
scattered through the pipeline. Model IDs are configurable via environment
variables (see `.env.example`).

## Modes

`AI_PROVIDER_MODE` controls behavior:

- `mock` (default) — deterministic canned responses, **no network, no keys, no cost**.
  Used for Milestones 0–5 and all tests/CI.
- `live` — real providers. Requires the relevant keys (validated at startup).

Check readiness without printing secrets:

```bash
pnpm provider:doctor          # presence + mode report
python scripts/provider-doctor.py --check-auth   # + lightweight auth probes
```

## Routing (from the spec)

| Stage | Primary | Fallback |
|---|---|---|
| Scene analysis | OpenAI Responses (`OPENAI_SCENE_MODEL`) | Anthropic Messages (`ANTHROPIC_SCENE_MODEL`) |
| Layer proposal | `fal-ai/qwen-image-layered` | — |
| Text segmentation | `fal-ai/evf-sam` | brush correction (offline) |
| Alpha matting | `fal-ai/birefnet/v2` | `fal-ai/birefnet` |
| Depth | `fal-ai/image-preprocessors/depth-anything/v2` | — |
| Completion (erase) | BFL FLUX erase | fal fill → OpenAI GPT Image 2 |

At least one real completion provider **or** the mock provider must be available.
The app must not require two language-model providers to start.

## Secret handling (mandatory)

- Keys live only in a local, git-ignored `.env` (server-side). They **never** reach
  the browser bundle.
- Never paste keys into chat, issues, code, or docs. `.env.example` uses placeholders.
- Diagnostics mask values (`sk-...abcd`).
- If a key is exposed/suspected, **rotate it** before enabling `live` mode.

> ⚠️ The original project spec accidentally embedded real-looking keys. They were
> redacted from the spec and must be treated as compromised — rotate before use.

## AI art styles (per-layer style transfer)

The Urban/Spider-Verse-style "Art style" picker restyles each scene layer through an
image model, preserving depth. It runs in two tiers:

- **Mock (default, offline):** deterministic Pillow filters — visibly distinct but
  placeholder. Generate them with:
  ```bash
  cd apps/ai-service
  ./.venv/bin/python -m app.stylize ../web/public/scenes/yosemite-falls
  ```
  This writes `scenes/<scene>/styles/<styleId>/<layerId>.png` + `styles/manifest.json`
  (git-ignored). The web "Art style" picker appears once a manifest exists.

- **Real AI:** put freshly-rotated keys in a local `.env`, set `AI_PROVIDER_MODE=live`,
  optionally set `OPENAI_IMAGE_MODEL` (the default is a placeholder id — set the
  current image-edit model your account has, e.g. `gpt-image-1`) or `FAL_STYLE_MODEL`,
  then re-run the same command. Outputs are cached by content hash, so only changed
  layers/styles regenerate. The adapters target the documented `/v1/images/edits`
  (OpenAI) and a fal img2img queue endpoint; **re-verify both against live docs**
  before production.

Styles: `spiderverse`, `watercolor`, `ink-sketch`, `pop-art`, `oil`.
