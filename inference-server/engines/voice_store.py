"""
Voice catalogue store. 100% open-source — voices are stored as a small
JSON manifest (`voices/_meta.json`).

Every voice is served by Indic-Parler-TTS (Apache 2.0) using its
`description` field as the style steering prompt — so voices can be
created and modified by editing a plain-English description.
"""

import json
import re
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VOICES_DIR = Path(__file__).parent.parent / "voices"
META_FILE = VOICES_DIR / "_meta.json"

# Curated style modifiers used by /tts/design to generate 3 audio variants
# from a single base description. Each variant subtly nudges the voice in a
# different direction so the user can A/B/C compare and pick one.
DESIGN_VARIANTS = [
    {"label": "Calm",     "suffix": " The delivery is calm, slow-paced, and measured, with very high audio quality and no background noise."},
    {"label": "Confident","suffix": " The delivery is confident, clear, and professional, with moderate pace, bright tone, and very high studio audio quality."},
    {"label": "Warm",     "suffix": " The delivery is warm, friendly, and expressive, with slight smile in the voice, natural pace, and very high audio quality."},
]


def _safe_id(voice_id: str) -> str:
    safe = re.sub(r"[^a-z0-9_-]+", "-", voice_id.lower()).strip("-")
    if not safe:
        raise ValueError("invalid voice id")
    return safe


def _read_meta() -> dict:
    if not META_FILE.exists():
        return {}
    try:
        return json.loads(META_FILE.read_text())
    except Exception:
        return {}


def _write_meta(meta: dict) -> None:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    META_FILE.write_text(json.dumps(meta, indent=2, ensure_ascii=False))


def _normalise(info: dict, vid: str, wav_name: str | None = None, duration_s: float = 0) -> dict:
    return {
        "id":          vid,
        "file":        wav_name,
        "displayName": info.get("displayName", vid.replace("-", " ").title()),
        "language":    info.get("language", "ta"),
        "gender":      info.get("gender", "unknown"),
        "description": info.get("description", ""),
        "engine":      info.get("engine", "parler"),
        "tags":        info.get("tags", []) or [],
        "useCase":     info.get("useCase", ""),
        "age":         info.get("age", ""),
        "accent":      info.get("accent", ""),
        "createdAt":   info.get("createdAt"),
        "updatedAt":   info.get("updatedAt"),
        "durationSeconds": duration_s,
        "builtin":     info.get("builtin", False),
        "favourite":   info.get("favourite", False),
    }


def list_voices() -> list[dict[str, Any]]:
    if not VOICES_DIR.exists():
        return []
    meta = _read_meta()
    seen: set[str] = set()
    voices: list[dict] = []

    for wav in sorted(VOICES_DIR.glob("*.wav")):
        info = meta.get(wav.stem, {})
        try:
            with wave.open(str(wav), "rb") as wf:
                duration_s = round(wf.getnframes() / max(1, wf.getframerate()), 2)
        except Exception:
            duration_s = 0
        seen.add(wav.stem)
        voices.append(_normalise(info, wav.stem, wav.name, duration_s))

    for vid, info in meta.items():
        if vid in seen:
            continue
        voices.append(_normalise(info, vid, None, 0))
    return sorted(voices, key=lambda v: v["displayName"].lower())


def save_voice(
    voice_id: str,
    display_name: str = "",
    language: str = "ta",
    gender: str = "unknown",
    description: str = "",
    tags: list[str] | None = None,
    use_case: str = "",
    age: str = "",
    accent: str = "",
) -> dict:
    """Create a prompt-driven voice. Description is required."""
    if not description.strip():
        raise ValueError("description is required")
    safe = _safe_id(voice_id)
    meta = _read_meta()
    now = datetime.now(timezone.utc).isoformat()
    meta[safe] = {
        "displayName": display_name or safe.replace("-", " ").title(),
        "language":    language,
        "gender":      gender,
        "description": description,
        "engine":      "parler",
        "tags":        tags or [],
        "useCase":     use_case,
        "age":         age,
        "accent":      accent,
        "createdAt":   meta.get(safe, {}).get("createdAt") or now,
        "updatedAt":   now,
        "builtin":     False,
        "favourite":   meta.get(safe, {}).get("favourite", False),
    }
    _write_meta(meta)
    return _normalise(meta[safe], safe)


def update_voice(voice_id: str, patch: dict) -> dict:
    """Patch any subset of mutable fields on an existing voice."""
    safe = _safe_id(voice_id)
    meta = _read_meta()
    if safe not in meta:
        raise KeyError(f"voice {safe} not found")
    allowed = {"displayName", "language", "gender", "description", "tags",
               "useCase", "age", "accent", "favourite"}
    for k, v in patch.items():
        if k in allowed and v is not None:
            meta[safe][k] = v
    meta[safe]["updatedAt"] = datetime.now(timezone.utc).isoformat()
    _write_meta(meta)
    return _normalise(meta[safe], safe)


def delete_voice(voice_id: str) -> bool:
    safe = _safe_id(voice_id)
    wav_path = VOICES_DIR / f"{safe}.wav"
    found = False
    if wav_path.exists():
        wav_path.unlink()
        found = True
    meta = _read_meta()
    if safe in meta:
        meta.pop(safe, None)
        _write_meta(meta)
        found = True
    return found


def voice_meta(voice_id: str) -> dict:
    return _read_meta().get(_safe_id(voice_id) if voice_id else "", {}) or {}
