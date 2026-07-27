FROM python:3.12-slim

# live = use GPT for hosted styles when OPENAI_API_KEY is set (falls back to the
# local engine if it isn't). Model + scene paths point at image-local dirs so the
# app doesn't rely on the web app's public/ tree.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_PROVIDER_MODE=live \
    SEGMENTATION_MODEL_PATH=/models/seg/u2net.onnx \
    DEPTH_MODEL_PATH=/models/depth/depth_anything_v2_vits.onnx \
    SCENES_OUTPUT_DIR=/data/scenes

# System libraries opencv-python-headless + numpy need at runtime, plus curl.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Separation models (byte-verified pinned release assets ~275 MB). Cached across
# builds unless the URLs change.
RUN mkdir -p /models/seg /models/depth \
    && curl -fSL -o /models/seg/u2net.onnx \
        https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx \
    && curl -fSL -o /models/depth/depth_anything_v2_vits.onnx \
        https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx

# App code (.dockerignore keeps .env, tests and caches out).
COPY . .

# Writable scene dir + non-root user.
RUN mkdir -p /data/scenes \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app /data /models
USER appuser

EXPOSE 8000

# Hosts (Render/Fly/Railway) inject $PORT and terminate TLS at their edge, so
# --proxy-headers lets the app see the real https host (for absolute asset URLs).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
