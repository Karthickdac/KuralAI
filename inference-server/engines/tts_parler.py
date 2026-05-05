"""
Indic-Parler-TTS — premium, prompt-driven Tamil/Indic TTS.

Parler models are *steered* by a free-text style description ("A warm female
speaker, slow expressive delivery, professional studio recording, slight
breathy tone"). This is what the user asked for: voices that can be modified
via prompts, no reference clip needed.

Defaults:
    model:        ai4bharat/indic-parler-tts (Tamil + 21 Indic languages)
    fallback:     parler-tts/parler-tts-mini-v1 (English + general)

The model runs on GPU and produces 24 kHz mono float32 audio. Output is peak-
normalized and resampled to the caller's requested rate (default 8 kHz for
telephony).
"""

import asyncio
import logging
import os
import wave
from pathlib import Path
from typing import Any

log = logging.getLogger("kuralai.tts.parler")

VOICES_DIR = Path(__file__).parent.parent / "voices"

# Recommended high-quality default style for Tamil customer-care.
DEFAULT_DESCRIPTION = (
    "A warm, professional female speaker delivers her words clearly and naturally "
    "in Tamil with a friendly, conversational tone, moderate pace, and very high "
    "studio audio quality with no background noise."
)


class ParlerTTSEngine:
    def __init__(self) -> None:
        self.model_name = os.environ.get(
            "TTS_PARLER_MODEL", "ai4bharat/indic-parler-tts"
        )
        self.device = os.environ.get("TTS_DEVICE", "cuda")
        self._model = None
        self._tokenizer = None
        self._description_tokenizer = None
        self._state = "loading"
        self._error: str | None = None

    def is_ready(self) -> bool:
        return self._state == "ready"

    def status(self) -> dict[str, Any]:
        return {
            "name": "indic-parler-tts",
            "model": self.model_name,
            "state": self._state,
            "device": self.device,
            "error": self._error,
            "supports_prompt_styling": True,
        }

    def list_models(self) -> list[str]:
        return ["indic-parler-tts", "parler-tts-mini-v1", "parler-tts-large-v1"]

    async def load(self) -> None:
        try:
            import torch  # type: ignore
            from parler_tts import ParlerTTSForConditionalGeneration  # type: ignore
            from transformers import AutoTokenizer  # type: ignore

            log.info("loading Parler-TTS %s on %s", self.model_name, self.device)

            def _load():
                dtype = torch.float16 if self.device == "cuda" else torch.float32
                model = ParlerTTSForConditionalGeneration.from_pretrained(
                    self.model_name, torch_dtype=dtype
                ).to(self.device)
                tok = AutoTokenizer.from_pretrained(self.model_name)
                # Indic-Parler ships a separate description tokenizer.
                desc_tok = tok
                try:
                    desc_tok = AutoTokenizer.from_pretrained(
                        getattr(model.config, "text_encoder", None).name_or_path
                        if hasattr(model.config, "text_encoder")
                        else self.model_name
                    )
                except Exception:
                    desc_tok = tok
                return model, tok, desc_tok

            self._model, self._tokenizer, self._description_tokenizer = await asyncio.to_thread(_load)
            self._state = "ready"
            log.info("Parler-TTS ready")
        except Exception as exc:  # noqa: BLE001
            self._state = "error"
            self._error = str(exc)
            log.exception("Parler TTS load failed")

    async def synth(
        self,
        text: str,
        voice: str = "samuthra-female-tamil",
        language: str = "ta",
        model: str = "indic-parler-tts",
        sample_rate: int = 8000,
        description: str | None = None,
    ) -> bytes:
        if not self._model:
            raise RuntimeError("Parler TTS not loaded")

        # Resolve the style description: explicit > voice metadata > default.
        style = (description or "").strip() or _description_for_voice(voice) or DEFAULT_DESCRIPTION

        def _run() -> bytes:
            import numpy as np  # type: ignore
            import torch  # type: ignore

            desc_ids = self._description_tokenizer(style, return_tensors="pt").input_ids.to(self.device)
            prompt_ids = self._tokenizer(text, return_tensors="pt").input_ids.to(self.device)
            with torch.inference_mode():
                generation = self._model.generate(
                    input_ids=desc_ids,
                    prompt_input_ids=prompt_ids,
                )
            audio = generation.cpu().to(torch.float32).numpy().squeeze()
            src_rate = int(getattr(self._model.config, "sampling_rate", 24000))

            # Premium post-processing: peak normalize to -3 dBFS, light de-DC.
            audio = audio - float(np.mean(audio))
            peak = float(np.max(np.abs(audio))) or 1.0
            audio = audio * (0.707 / peak)  # ~ -3 dBFS
            pcm16 = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16).tobytes()

            if src_rate != sample_rate:
                pcm16 = _resample_pcm16(pcm16, src_rate, sample_rate)
            return pcm16

        return await asyncio.to_thread(_run)


def _description_for_voice(voice_id: str) -> str | None:
    """Read a voice's stored style description from voices/_meta.json."""
    import json
    meta_file = VOICES_DIR / "_meta.json"
    if not meta_file.exists():
        return None
    try:
        meta = json.loads(meta_file.read_text())
    except Exception:
        return None
    return (meta.get(voice_id) or {}).get("description") or None


def _resample_pcm16(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
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
