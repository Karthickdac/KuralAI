"""
Voice catalogue store. 100% open-source — voices are stored as a small
JSON manifest (`voices/_meta.json`) plus optional reference WAVs.

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


def _safe_id(voice_id: str) -> str:
    safe = re.sub(r"[^a-z0-9_-]+", "-", voice_id.lower()).strip("-")
    if not safe:
        raise ValueError("invalid voice id")
    return safe


def list_voices() -> list[dict[str, Any]]:
    if not VOICES_DIR.exists():
        return []
    meta_file = VOICES_DIR / "_meta.json"
    meta: dict = {}
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text())
        except Exception:
            meta = {}

    seen: set[str] = set()
    voices: list[dict] = []

    # Cloned voices (have a WAV) — kept for backwards-compat with already-
    # uploaded references. New cloning UI is gone (XTTS removed) so these are
    # legacy entries; Parler still uses the metadata description for styling.
    for wav in sorted(VOICES_DIR.glob("*.wav")):
        info = meta.get(wav.stem, {})
        try:
            with wave.open(str(wav), "rb") as wf:
                duration_s = round(wf.getnframes() / max(1, wf.getframerate()), 2)
        except Exception:
            duration_s = 0
        seen.add(wav.stem)
        voices.append({
            "id":          wav.stem,
            "file":        wav.name,
            "displayName": info.get("displayName", wav.stem.replace("-", " ").title()),
            "language":    info.get("language", "ta"),
            "gender":      info.get("gender", "unknown"),
            "description": info.get("description", ""),
            "engine":      info.get("engine", "parler"),
            "createdAt":   info.get("createdAt"),
            "durationSeconds": duration_s,
            "builtin":     info.get("builtin", False),
        })

    for vid, info in meta.items():
        if vid in seen:
            continue
        voices.append({
            "id":          vid,
            "file":        None,
            "displayName": info.get("displayName", vid.replace("-", " ").title()),
            "language":    info.get("language", "ta"),
            "gender":      info.get("gender", "unknown"),
            "description": info.get("description", ""),
            "engine":      info.get("engine", "parler"),
            "createdAt":   info.get("createdAt"),
            "durationSeconds": 0,
            "builtin":     info.get("builtin", False),
        })
    return sorted(voices, key=lambda v: v["displayName"].lower())


def save_voice(voice_id: str, display_name: str = "", language: str = "ta",
               gender: str = "unknown", description: str = "") -> dict:
    """Create or update a prompt-driven voice. Description is required."""
    if not description.strip():
        raise ValueError("description is required")
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    safe = _safe_id(voice_id)

    meta_file = VOICES_DIR / "_meta.json"
    meta: dict = {}
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text())
        except Exception:
            meta = {}
    meta[safe] = {
        "displayName": display_name or safe.replace("-", " ").title(),
        "language":    language,
        "gender":      gender,
        "description": description,
        "engine":      "parler",
        "createdAt":   datetime.now(timezone.utc).isoformat(),
        "builtin":     False,
    }
    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return {"id": safe, "displayName": meta[safe]["displayName"]}


def delete_voice(voice_id: str) -> bool:
    safe = _safe_id(voice_id)
    wav_path = VOICES_DIR / f"{safe}.wav"
    meta_file = VOICES_DIR / "_meta.json"
    found = False
    if wav_path.exists():
        wav_path.unlink()
        found = True
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text())
            if safe in meta:
                meta.pop(safe, None)
                meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
                found = True
        except Exception:
            pass
    return found


def voice_meta(voice_id: str) -> dict:
    meta_file = VOICES_DIR / "_meta.json"
    if not meta_file.exists():
        return {}
    try:
        meta = json.loads(meta_file.read_text())
    except Exception:
        return {}
    return meta.get(voice_id, {}) or {}
