# Deployment

**Live:** https://picsmotion-stylepaint.vercel.app

PicMotion has two deployable parts. The **gallery demo is fully static** and needs
no backend. **User photo upload** needs the AI service running somewhere.

---

## 1. Frontend + gallery (Vercel, static — no backend)

The web app and the curated gallery (6 scenes, each restyled through
`gpt-image-1` and shipped as lean WebP) deploy as static assets.

**Vercel project settings** (the one gotcha that caused "No Output Directory: public"):

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Framework Preset | `Next.js` (not "Other") |
| Build Command | _default_ (`next build`) |
| Install Command | _default_ (Vercel detects the pnpm workspace) |

With the GitHub integration connected, **every push to `main` auto-deploys to
production**. No manual redeploy needed.

The gallery, depth-layer parallax, and the AI-style paintbrush all work with
zero backend — the styled frames are pre-baked WebP served from
`apps/web/public/scenes/`.

### Refreshing / adding gallery scenes

The pipeline is one reusable command (needs `OPENAI_API_KEY` in
`apps/ai-service/.env`, `AI_PROVIDER_MODE=live`):

```bash
# Separate every photo in a folder into layers, restyle via GPT, build the index
python scripts/build-scenes.py --src apps/web/public/demo-photos
# (build-scenes already writes WebP; this re-optimizes any scene on demand)
python scripts/optimize-styles.py
```

Cost/time: ~$0.14 and ~26 s per GPT image (12 GPT styles + 1 local per scene).
Only the lean deploy set is committed (WebP styles, layers, `scene.json`,
previews); source PNGs, `.sha` sidecars, `original/` and `background.png` stay
local (see `.gitignore`). Curate which scenes ship via the `!gallery/<id>/`
re-includes in `.gitignore` plus `gallery/index.json`.

---

## 2. User photo upload (needs the AI service hosted)

The **Upload photo** button POSTs to `<NEXT_PUBLIC_API_BASE_URL>/scenes/process`,
which runs the same pipeline on the uploaded image: depth separation
(U²-Net + Depth-Anything ONNX) → GPT styles → WebP. This **cannot run on Vercel
serverless** — the model weights (~270 MB) exceed the bundle limit and a full
restyle takes minutes, past the function timeout.

Everything needed to host it ships in the repo: `apps/ai-service/Dockerfile`
(installs deps, downloads the U²-Net + Depth-Anything models, runs uvicorn with
`--proxy-headers`). The service serves the scenes it generates and returns
**absolute** asset URLs, so the browser loads uploaded scenes from the backend,
not from Vercel. Pick a host below.

### Option A — Hugging Face Spaces (free, recommended)

Free CPU tier, 16 GB RAM (plenty for the models), always-on (sleeps when idle,
wakes on request). Runs the same Dockerfile.

1. **Create the Space:** huggingface.co → **New → Space** → **SDK: Docker**,
   hardware **CPU basic (free)**, name e.g. `picsmotion-ai`.
2. **Fill it in** (from the project root; excludes your `.env` automatically):
   ```bash
   git clone https://huggingface.co/spaces/<your-user>/picsmotion-ai hf-space
   scripts/prep-hf-space.sh hf-space
   cd hf-space && git add -A && git commit -m "Deploy PicMotion AI service" && git push
   ```
   (the push asks for your HF username + an access token as the password —
   create one at huggingface.co/settings/tokens with **write** scope.)
3. **Set the secret:** Space → **Settings → Variables and secrets** → add secret
   `OPENAI_API_KEY`. Never commit it.
4. HF builds the image (~5–10 min, downloads the models). When it's running, your
   API base is **`https://<your-user>-picsmotion-ai.hf.space`** — test
   `…/health` → `{"status":"healthy"}`.

### Option B — Render (paid, no cold starts)

`render.yaml` is a one-click blueprint, but the free tier's 512 MB OOMs on the
models, so this needs the **Standard (2 GB, ~$25/mo)** plan.

1. Render Dashboard → **New → Blueprint** → select this repo (uses `render.yaml`),
   or **New → Web Service** → Runtime **Docker**, Dockerfile
   `apps/ai-service/Dockerfile`, context `apps/ai-service`.
2. Plan: **Standard (2 GB RAM)** — the models need ~1–1.5 GB; 512 MB will OOM.
3. Set env var **`OPENAI_API_KEY`** (for GPT styles). Nothing else is required —
   `AI_PROVIDER_MODE=live` and the model paths are baked into the image, and CORS
   already allows this project's `*.vercel.app` origins by regex.
4. Deploy, then copy the service URL (e.g. `https://picsmotion-ai.onrender.com`).

**Point the frontend at it:**

5. Vercel → the web project → **Settings → Environment Variables** → add
   `NEXT_PUBLIC_API_BASE_URL = https://picsmotion-ai.onrender.com` (Production).
6. **Redeploy** the web app. Upload now POSTs to the hosted backend.

Fly.io / Railway work the same way — point them at `apps/ai-service/Dockerfile`,
give them ~1–2 GB RAM, and set `OPENAI_API_KEY`.

### Production notes

- **Latency:** `/scenes/process` is synchronous. Style generation now runs a few
  GPT calls concurrently (`_MAX_CONCURRENT_STYLES` in `app/stylize.py`), so a
  photo takes ~1–2 min instead of ~6. If your host enforces a shorter request
  timeout, either raise it, lower `_MAX_CONCURRENT_STYLES`'s workload (fewer
  styles), or migrate upload to the async job API (`app/jobs.py`).
- **Persistence:** uploaded scenes live under `SCENES_OUTPUT_DIR` (`/data/scenes`
  in the image) and are ephemeral — fine for upload-then-view, but attach a
  persistent disk / object storage if you need them to survive restarts.
- **Cost/abuse:** each upload triggers ~12 GPT image calls (~$1–2). For a public
  demo, consider rate-limiting or gating the upload endpoint.

---

## Security

- `apps/ai-service/.env` (holding `OPENAI_API_KEY`) is git-ignored — never commit it.
- If a key is ever exposed, **rotate it immediately** and set the new value only
  in the host's secret manager / env vars.
- The deployed frontend calls OpenAI **only** through the hosted AI service, so
  no key is ever shipped to the browser.
