"""
KuralAI Local Inference Server
==============================

Self-hosted STT + LLM + TTS for the KuralAI Tamil voice agent. Designed to run
on a single GPU box (RTX 4090 / A10 / L4) and exposed to the Node app over HTTP.

Endpoints:
  GET  /health                 — per-engine load state + VRAM usage
  POST /stt                    — multipart audio in, transcript JSON out
  POST /llm/chat               — JSON in, SSE token stream out
  POST /tts                    — JSON in, audio bytes out (PCM16 mono @ 8 kHz)
  GET  /voices                 — list available TTS voices
  GET  /models                 — list available STT/LLM/TTS models

All models are loaded on boot and kept hot in memory. The server only reports
"ready" once every configured engine has finished loading.
"""

import asyncio
import logging
import os
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from engines import llm_ollama, stt_whisper, tts_parler, voice_store
from engines.registry import REGISTRY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("kuralai.inference")

app = FastAPI(title="KuralAI Local Inference", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

API_TOKEN = os.environ.get("KURALAI_INFERENCE_TOKEN", "")
BOOT_TS = time.time()


# ─── Auth ─────────────────────────────────────────────────────────────────────
def _require_token(authorization: str | None) -> None:
    if not API_TOKEN:
        return  # auth disabled
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    if authorization.removeprefix("Bearer ").strip() != API_TOKEN:
        raise HTTPException(403, "invalid token")


# ─── Startup: warm models ─────────────────────────────────────────────────────
@app.on_event("startup")
async def _warmup() -> None:
    log.info("warming engines (this may take a few minutes on first boot)...")
    # 100% open-source stack:
    #   STT → faster-whisper (MIT)
    #   LLM → Qwen2.5-7B via Ollama (Apache 2.0)
    #   TTS → Indic-Parler-TTS / Parler-TTS (Apache 2.0) — prompt-driven voices
    REGISTRY["stt"] = stt_whisper.WhisperSTT()
    REGISTRY["llm"] = llm_ollama.OllamaLLM()
    REGISTRY["tts"] = tts_parler.ParlerTTSEngine()
    await asyncio.gather(
        REGISTRY["stt"].load(),
        REGISTRY["llm"].load(),
        REGISTRY["tts"].load(),
    )
    log.info("all engines ready")


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> JSONResponse:
    engines = {name: e.status() for name, e in REGISTRY.items()}
    ready = all(s.get("state") == "ready" for s in engines.values())
    return JSONResponse(
        {
            "ready": ready,
            "uptime_seconds": int(time.time() - BOOT_TS),
            "engines": engines,
        },
        status_code=200 if ready else 503,
    )


# ─── STT ──────────────────────────────────────────────────────────────────────
@app.post("/stt")
async def stt_endpoint(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    model: str = Form("whisper-large-v3"),
    authorization: str | None = None,
) -> JSONResponse:
    _require_token(authorization)
    engine = REGISTRY.get("stt")
    if not engine or not engine.is_ready():
        raise HTTPException(503, "STT not ready")
    audio_bytes = await file.read()
    t0 = time.time()
    result = await engine.transcribe(audio_bytes, language=language, model=model)
    return JSONResponse(
        {
            "transcript": result["text"],
            "language": result["language"],
            "duration_ms": int((time.time() - t0) * 1000),
            "model": model,
        }
    )


# ─── LLM (SSE streaming) ──────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str = "qwen2.5:7b-instruct"
    temperature: float = 0.4
    max_tokens: int = 256


@app.post("/llm/chat")
async def llm_chat(req: ChatRequest) -> StreamingResponse:
    engine = REGISTRY.get("llm")
    if not engine or not engine.is_ready():
        raise HTTPException(503, "LLM not ready")

    async def event_stream():
        async for token in engine.chat_stream(
            messages=[m.dict() for m in req.messages],
            model=req.model,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        ):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── TTS ──────────────────────────────────────────────────────────────────────
class TtsRequest(BaseModel):
    text: str
    voice: str = "samuthra-female-tamil"
    language: str = "ta"
    model: str = "indic-parler-tts"
    sample_rate: int = 8000          # caller resamples nothing; telephony-ready
    description: str | None = None   # natural-language style steering (Parler)


@app.post("/tts")
async def tts_endpoint(req: TtsRequest) -> Response:
    engine = REGISTRY.get("tts")
    if not engine or not engine.is_ready():
        raise HTTPException(503, "TTS not ready")
    # If the caller didn't pass an explicit description, fall back to the one
    # stored in the voice catalogue for this voice ID.
    description = req.description or (voice_store.voice_meta(req.voice) or {}).get("description") or None
    pcm16 = await engine.synth(
        text=req.text,
        voice=req.voice,
        language=req.language,
        model=req.model,
        sample_rate=req.sample_rate,
        description=description,
    )
    return Response(
        content=pcm16,
        media_type="audio/L16",
        headers={
            "X-Sample-Rate": str(req.sample_rate),
            "X-Channels": "1",
            "X-Encoding": "pcm16le",
        },
    )


@app.get("/voices")
def list_voices() -> JSONResponse:
    return JSONResponse({"voices": voice_store.list_voices()})


@app.post("/voices")
async def upsert_voice(
    voice_id: str = Form(...),
    display_name: str = Form(""),
    language: str = Form("ta"),
    gender: str = Form("unknown"),
    description: str = Form(...),
    authorization: str | None = None,
) -> JSONResponse:
    """Create or update a prompt-driven voice. Indic-Parler-TTS will use the
    plain-language description as the style-steering prompt for every TTS
    request that selects this voice ID. Modify any voice anytime by simply
    updating the description — no audio re-recording required."""
    _require_token(authorization)
    if not description.strip():
        raise HTTPException(400, "description is required")
    info = voice_store.save_voice(
        voice_id=voice_id,
        display_name=display_name,
        language=language,
        gender=gender,
        description=description,
    )
    return JSONResponse({"voice": info})


@app.delete("/voices/{voice_id}")
def delete_voice(voice_id: str, authorization: str | None = None) -> JSONResponse:
    _require_token(authorization)
    if not voice_store.delete_voice(voice_id):
        raise HTTPException(404, "voice not found")
    return JSONResponse({"deleted": voice_id})


@app.post("/tts/preview")
async def tts_preview(req: TtsRequest) -> Response:
    """Same as /tts but returns a self-contained WAV (with header) at studio
    quality (≥22.05 kHz) so the dashboard can audition voices through an
    <audio> tag."""
    engine = REGISTRY.get("tts")
    if not engine or not engine.is_ready():
        raise HTTPException(503, "TTS not ready")
    description = req.description or (voice_store.voice_meta(req.voice) or {}).get("description") or None
    pcm16 = await engine.synth(
        text=req.text,
        voice=req.voice,
        language=req.language,
        model=req.model,
        sample_rate=max(req.sample_rate, 22050),
        description=description,
    )
    # Wrap as WAV so the browser can play it.
    import io as _io
    import wave as _wave
    buf = _io.BytesIO()
    with _wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(max(req.sample_rate, 22050))
        wf.writeframes(pcm16)
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.get("/models")
def list_models() -> JSONResponse:
    return JSONResponse(
        {
            "stt": REGISTRY["stt"].list_models() if "stt" in REGISTRY else [],
            "llm": REGISTRY["llm"].list_models() if "llm" in REGISTRY else [],
            "tts": REGISTRY["tts"].list_models() if "tts" in REGISTRY else [],
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8800)),
        log_level="info",
    )
