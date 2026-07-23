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
