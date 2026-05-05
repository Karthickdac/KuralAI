"""
Coqui XTTS-v2 TTS engine.

Generates speech from text in Tamil/English (and ~16 other languages) and
returns raw PCM16 mono at the requested sample rate (default 8 kHz so the
Node app can stream straight to Twilio Media Streams without resampling).

A small built-in voice catalogue maps logical voice IDs (e.g.
`samuthra-female-tamil`) to reference WAV samples shipped under `voices/`.
Adding a new voice = drop a 6–10 sec clean WAV into `voices/<id>.wav`.
"""

import asyncio
import io
import logging
import os
import wave
from pathlib import Path
from typing import Any

log = logging.getLogger("kuralai.tts")

VOICES_DIR = Path(__file__).parent.parent / "voices"


class XTTSEngine:
    def __init__(self) -> None:
        self.model_name = os.environ.get("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
        self.device = os.environ.get("TTS_DEVICE", "cuda")
        self._tts = None
        self._state = "loading"
        self._error: str | None = None

    def is_ready(self) -> bool:
        return self._state == "ready"

    def status(self) -> dict[str, Any]:
        return {
            "name": "coqui-xtts",
            "model": self.model_name,
            "state": self._state,
            "device": self.device,
            "voices": len(self.list_voices()),
            "error": self._error,
        }

    def list_models(self) -> list[str]:
        return ["xtts-v2", "indic-parler-tts"]

    def list_voices(self) -> list[dict]:
        if not VOICES_DIR.exists():
            return []
        meta_file = VOICES_DIR / "_meta.json"
        meta: dict = {}
        if meta_file.exists():
            try:
                import json as _json
                meta = _json.loads(meta_file.read_text())
            except Exception:
                meta = {}

        seen: set[str] = set()
        voices: list[dict] = []

        # 1) Cloned voices have a WAV on disk → engine = xtts.
        for wav in sorted(VOICES_DIR.glob("*.wav")):
            info = meta.get(wav.stem, {})
            try:
                with wave.open(str(wav), "rb") as wf:
                    duration_s = round(wf.getnframes() / max(1, wf.getframerate()), 2)
            except Exception:
                duration_s = 0
            seen.add(wav.stem)
            voices.append({
                "id":           wav.stem,
                "file":         wav.name,
                "displayName":  info.get("displayName", wav.stem.replace("-", " ").title()),
                "language":     info.get("language", "ta"),
                "gender":       info.get("gender", "unknown"),
                "description":  info.get("description", ""),
                "engine":       info.get("engine", "xtts"),
                "tags":         info.get("tags", []),
                "createdAt":    info.get("createdAt"),
                "durationSeconds": duration_s,
                "builtin":      info.get("builtin", False),
            })

        # 2) Prompt-only voices have no WAV — engine = parler. Served by
        #    Indic-Parler-TTS using the stored description.
        for vid, info in meta.items():
            if vid in seen:
                continue
            voices.append({
                "id":           vid,
                "file":         None,
                "displayName":  info.get("displayName", vid.replace("-", " ").title()),
                "language":     info.get("language", "ta"),
                "gender":       info.get("gender", "unknown"),
                "description":  info.get("description", ""),
                "engine":       info.get("engine", "parler"),
                "tags":         info.get("tags", []),
                "createdAt":    info.get("createdAt"),
                "durationSeconds": 0,
                "builtin":      info.get("builtin", False),
            })
        return sorted(voices, key=lambda v: v["displayName"].lower())

    @staticmethod
    def save_voice(voice_id: str, wav_bytes: bytes, display_name: str = "",
                   language: str = "ta", gender: str = "unknown",
                   description: str = "", engine: str = "") -> dict:
        """Save a reference WAV under voices/<id>.wav and update _meta.json.

        Accepts arbitrary WAV/PCM bytes. XTTS-v2 needs a 6–10 sec mono clip at
        ≥16 kHz; longer files are accepted but only the first ~20 sec is used.
        """
        import json as _json
        import re

        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        safe_id = re.sub(r"[^a-z0-9_-]+", "-", voice_id.lower()).strip("-")
        if not safe_id:
            raise ValueError("invalid voice id")

        # Two voice modes:
        #   - WAV uploaded   → cloned voice, served by XTTS-v2
        #   - WAV not given  → prompt-only voice, served by Parler-TTS
        engine_kind = engine or ("xtts" if wav_bytes else "parler")
        if wav_bytes:
            wav_path = VOICES_DIR / f"{safe_id}.wav"
            wav_path.write_bytes(wav_bytes)

        meta_file = VOICES_DIR / "_meta.json"
        meta: dict = {}
        if meta_file.exists():
            try:
                meta = _json.loads(meta_file.read_text())
            except Exception:
                meta = {}
        from datetime import datetime, timezone
        meta[safe_id] = {
            "displayName": display_name or safe_id.replace("-", " ").title(),
            "language": language,
            "gender": gender,
            "description": description,
            "engine": engine_kind,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "builtin": False,
        }
        meta_file.write_text(_json.dumps(meta, indent=2, ensure_ascii=False))
        return {"id": safe_id, "displayName": meta[safe_id]["displayName"], "engine": engine_kind}

    @staticmethod
    def delete_voice(voice_id: str) -> bool:
        return _delete_voice_impl(voice_id)

    async def load(self) -> None:
        try:
            from TTS.api import TTS  # type: ignore

            log.info("loading XTTS-v2 on %s", self.device)
            self._tts = await asyncio.to_thread(
                TTS, self.model_name, gpu=(self.device == "cuda")
            )
            self._state = "ready"
            log.info("XTTS ready (%d voices)", len(self.list_voices()))
        except Exception as exc:  # noqa: BLE001
            self._state = "error"
            self._error = str(exc)
            log.exception("TTS load failed")

    async def synth(
        self,
        text: str,
        voice: str = "samuthra-female-tamil",
        language: str = "ta",
        model: str = "xtts-v2",
        sample_rate: int = 8000,
        description: str | None = None,   # ignored: XTTS is reference-WAV driven
    ) -> bytes:
        if not self._tts:
            raise RuntimeError("TTS not loaded")

        speaker_wav = VOICES_DIR / f"{voice}.wav"
        if not speaker_wav.exists():
            speaker_wav = VOICES_DIR / "samuthra-female-tamil.wav"

        def _run() -> bytes:
            import numpy as np  # type: ignore
            wav_path = "/tmp/kuralai_tts_out.wav"
            self._tts.tts_to_file(
                text=text,
                speaker_wav=str(speaker_wav) if speaker_wav.exists() else None,
                language=language.split("-")[0],
                file_path=wav_path,
            )
            with wave.open(wav_path, "rb") as wf:
                src_rate = wf.getframerate()
                pcm = wf.readframes(wf.getnframes())

            # Premium polish: peak-normalize to ~ -3 dBFS so output sounds
            # consistent across voices and matches Parler's loudness.
            try:
                arr = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
                if arr.size:
                    peak = float(np.max(np.abs(arr))) or 1.0
                    arr = arr * (23000.0 / peak)
                    pcm = np.clip(arr, -32768, 32767).astype(np.int16).tobytes()
            except Exception:
                pass

            if src_rate != sample_rate:
                pcm = _resample_pcm16(pcm, src_rate, sample_rate)
            return pcm

        return await asyncio.to_thread(_run)


def _voice_meta(voice_id: str) -> dict:
    """Helper for app.py — read a single voice's metadata from _meta.json."""
    import json as _json
    meta_file = VOICES_DIR / "_meta.json"
    if not meta_file.exists():
        return {}
    try:
        meta = _json.loads(meta_file.read_text())
    except Exception:
        return {}
    return meta.get(voice_id, {}) or {}


def _delete_voice_impl(voice_id: str) -> bool:
    import json as _json
    import re
    safe_id = re.sub(r"[^a-z0-9_-]+", "-", voice_id.lower()).strip("-")
    wav_path = VOICES_DIR / f"{safe_id}.wav"
    meta_file = VOICES_DIR / "_meta.json"
    found = False
    if wav_path.exists():
        wav_path.unlink()
        found = True
    if meta_file.exists():
        try:
            meta = _json.loads(meta_file.read_text())
            if safe_id in meta:
                meta.pop(safe_id, None)
                meta_file.write_text(_json.dumps(meta, indent=2, ensure_ascii=False))
                found = True
        except Exception:
            pass
    return found


def _resample_pcm16(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Linear-interpolation resampler. Adequate for 8 kHz telephony output."""
    import array

    src = array.array("h")
    src.frombytes(pcm)
    if src_rate == dst_rate or len(src) == 0:
        return pcm
    ratio = dst_rate / src_rate
    out_len = int(len(src) * ratio)
    dst = array.array("h", [0] * out_len)
    for i in range(out_len):
        src_idx = i / ratio
        lo = int(src_idx)
        hi = min(lo + 1, len(src) - 1)
        frac = src_idx - lo
        dst[i] = int(src[lo] * (1 - frac) + src[hi] * frac)
    return dst.tobytes()
