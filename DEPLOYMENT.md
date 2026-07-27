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

To enable upload in production:

1. **Host `apps/ai-service`** on an always-on host (Render, Railway, Fly.io, or a
   small VM). It needs:
   - the model weights (`scripts/prep-segmentation-model.py`,
     `scripts/prep-style-models.py`),
   - `OPENAI_API_KEY` set as a server env var (never committed),
   - `AI_PROVIDER_MODE=live`.
   Run it with `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
2. **Point the frontend at it**: set `NEXT_PUBLIC_API_BASE_URL` in the Vercel
   project to the backend's public URL, then redeploy.

### Production robustness notes

- `/scenes/process` is **synchronous** and takes several minutes per photo (13
  styles). Front it with a proxy/host that allows long request timeouts, or
  migrate upload to the async job API (`app/jobs.py`, `POST /pipeline/jobs` +
  poll `GET /pipeline/jobs/{id}`) so the browser polls instead of holding one
  long request. For a snappier upload, restyle fewer styles or lower
  `gpt-image-1` quality.
- Uploaded scenes are written under `scenes/uploads/<hash>/` and are **not**
  committed (git-ignored). On a hosted backend, put them on a persistent volume
  or object storage so they survive restarts.

---

## Security

- `apps/ai-service/.env` (holding `OPENAI_API_KEY`) is git-ignored — never commit it.
- If a key is ever exposed, **rotate it immediately** and set the new value only
  in the host's secret manager / env vars.
- The deployed frontend calls OpenAI **only** through the hosted AI service, so
  no key is ever shipped to the browser.
