#!/usr/bin/env bash
# Assemble a Hugging Face Space (Docker SDK) for the PicMotion AI service.
#
# Usage:
#   1) Create a Docker Space on HF (see DEPLOYMENT.md), then clone it:
#        git clone https://huggingface.co/spaces/<user>/<space> hf-space
#   2) Run this to fill it in:
#        scripts/prep-hf-space.sh hf-space
#   3) Push:
#        cd hf-space && git add -A && git commit -m "Deploy PicMotion AI service" && git push
#
# It copies apps/ai-service into the target, EXCLUDING .env and other secrets so
# the key never lands in the (public) Space repo — set OPENAI_API_KEY as a Space
# secret instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/apps/ai-service"
DEST="${1:-$ROOT/hf-space}"

mkdir -p "$DEST"

rsync -a \
  --exclude='.env' --exclude='.env.*' \
  --exclude='.venv/' --exclude='venv/' \
  --exclude='__pycache__/' --exclude='*.pyc' \
  --exclude='.pytest_cache/' --exclude='.mypy_cache/' --exclude='.ruff_cache/' \
  --exclude='.git/' --exclude='tests/' \
  "$SRC/" "$DEST/"

# HF Space metadata README (overwrites the service README at the Space root).
# app_port=8000 matches the Dockerfile's default; HF routes traffic there.
cat > "$DEST/README.md" <<'EOF'
---
title: PicMotion AI Service
emoji: 🎨
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 8000
pinned: false
---

# PicMotion AI Service

Backend for the PicMotion web app: photo → depth-layer separation + AI art
styles. Set **`OPENAI_API_KEY`** as a Space secret (Settings → Variables and
secrets) — never commit it. The web app points at this Space via
`NEXT_PUBLIC_API_BASE_URL`.
EOF

# Never let a secret be committed from this dir either.
cat > "$DEST/.gitignore" <<'EOF'
.env
.env.*
.venv/
__pycache__/
EOF

echo "Assembled HF Space at: $DEST"
if [ -e "$DEST/.env" ]; then
  echo "  !!! .env present in $DEST — DELETE it before pushing (it holds your key)"
  exit 1
fi
echo "  ok: no .env copied. Next: cd '$DEST' && git add -A && git commit -m deploy && git push"
