# KuralAI Local Inference Server

Self-hosted STT + LLM + TTS for the KuralAI Tamil voice agent. Runs on a single
GPU box and exposes HTTP/SSE endpoints consumed by the Node app at
`src/services/localApi.js`.

## Hardware

| GPU         | Concurrent calls | Tamil quality | Notes                            |
|-------------|------------------|---------------|----------------------------------|
| RTX 4090    | 3–5              | Excellent     | Best price/performance for v1    |
| A10 / L4    | 5–10             | Excellent     | Cloud, easier scaling            |
| RTX 3090    | 2–4              | Excellent     | Older but capable                |
| CPU only    | 1 (degraded)     | Acceptable    | Prototype only — not for prod    |

Minimum 24 GB VRAM is recommended to keep Whisper-large-v3, Qwen2.5-7B and
XTTS-v2 all warm simultaneously.

## Deploy

```bash
git clone <this repo>
cd inference-server

# Optional: protect the API
echo "KURALAI_INFERENCE_TOKEN=$(openssl rand -hex 32)" > .env

# First boot pulls the LLM weights and downloads STT/TTS models — give it
# 5–15 minutes depending on bandwidth.
docker compose up -d

# Tail logs until you see `all engines ready`
docker compose logs -f inference

# Sanity check
curl http://localhost:8800/health
```

Then on the KuralAI app server, set `localInferenceUrl` in Settings → AI &
Voice → Local Engine to `https://<your-gpu-host>:8800` and (if used) paste the
same token into `localInferenceToken`.

## Endpoints

| Method | Path        | Purpose                                    |
|--------|-------------|--------------------------------------------|
| GET    | `/health`   | Per-engine state + readiness               |
| POST   | `/stt`      | Multipart audio → transcript JSON          |
| POST   | `/llm/chat` | Streaming chat completions (SSE)           |
| POST   | `/tts`      | Text → PCM16 mono audio                    |
| GET    | `/voices`   | List built-in voices                       |
| GET    | `/models`   | List loadable models per engine            |

## Adding a voice

Drop a clean 6–10 second mono 22.05 kHz WAV into `voices/<id>.wav`. Restart the
container; the voice immediately appears in `GET /voices` and is selectable in
the dashboard.

## Operator runbook

- **Restart all engines**: `docker compose restart inference`
- **Switch LLM**: edit `LLM_MODEL` in `docker-compose.yml`, then restart.
- **Switch STT model size**: set `STT_MODEL=medium` (or `small`) for lower VRAM.
- **CPU-only fallback**: set `STT_DEVICE=cpu`, `TTS_DEVICE=cpu`,
  `STT_COMPUTE_TYPE=int8`. Expect ~5 s per turn (prototype only).
- **Health check fails (503)**: check `docker compose logs inference` — usually
  a model download or VRAM OOM. The Node app automatically falls back to the
  next engine in the chain (Sarvam by default).
