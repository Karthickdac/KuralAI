"""
faster-whisper STT engine.

Defaults to large-v3 for best Tamil quality; can be swapped to medium/small for
CPU-only deployments. Optionally falls back to AI4Bharat IndicConformer when
language is forced to Tamil and the user opts in.
"""

import asyncio
import io
import logging
import os
from typing import Any

log = logging.getLogger("kuralai.stt")


class WhisperSTT:
    def __init__(self) -> None:
        self.model_name = os.environ.get("STT_MODEL", "large-v3")
        self.device = os.environ.get("STT_DEVICE", "cuda")
        self.compute_type = os.environ.get("STT_COMPUTE_TYPE", "float16")
        self._model = None
        self._state = "loading"
        self._error: str | None = None

    def is_ready(self) -> bool:
        return self._state == "ready"

    def status(self) -> dict[str, Any]:
        return {
            "name": "faster-whisper",
            "model": self.model_name,
            "state": self._state,
            "device": self.device,
            "error": self._error,
        }

    def list_models(self) -> list[str]:
        return ["whisper-large-v3", "whisper-medium", "whisper-small", "indic-conformer"]

    async def load(self) -> None:
        try:
            from faster_whisper import WhisperModel  # type: ignore

            log.info("loading faster-whisper %s on %s", self.model_name, self.device)
            self._model = await asyncio.to_thread(
                WhisperModel,
                self.model_name,
                device=self.device,
                compute_type=self.compute_type,
            )
            self._state = "ready"
            log.info("faster-whisper ready")
        except Exception as exc:  # noqa: BLE001
            self._state = "error"
            self._error = str(exc)
            log.exception("STT load failed")

    async def transcribe(
        self,
        audio_bytes: bytes,
        language: str = "auto",
        model: str = "whisper-large-v3",
    ) -> dict[str, Any]:
        if not self._model:
            raise RuntimeError("STT model not loaded")

        def _run() -> dict[str, Any]:
            lang = None if language in ("auto", "", None) else language.split("-")[0]
            segments, info = self._model.transcribe(
                io.BytesIO(audio_bytes),
                language=lang,
                vad_filter=True,
                beam_size=5,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            return {"text": text, "language": info.language}

        return await asyncio.to_thread(_run)
