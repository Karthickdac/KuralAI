"""
Ollama-backed LLM engine.

Talks to a local Ollama daemon (default http://localhost:11434) and streams
tokens out as they arrive. Default model is Qwen2.5-7B-Instruct (good Tamil +
strong instruction following); Llama-3.1-8B and Tamil LoRAs are also supported.
"""

import json
import logging
import os
from typing import Any, AsyncIterator

import httpx

log = logging.getLogger("kuralai.llm")


class OllamaLLM:
    def __init__(self) -> None:
        self.base_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
        self.default_model = os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct")
        self._state = "loading"
        self._error: str | None = None

    def is_ready(self) -> bool:
        return self._state == "ready"

    def status(self) -> dict[str, Any]:
        return {
            "name": "ollama",
            "model": self.default_model,
            "state": self._state,
            "base_url": self.base_url,
            "error": self._error,
        }

    def list_models(self) -> list[str]:
        # Recommended models. Operators can pull additional models via Ollama.
        return [
            "qwen2.5:7b-instruct",
            "qwen2.5:14b-instruct",
            "llama3.1:8b-instruct",
            "gemma2:9b-instruct",
        ]

    async def load(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Probe Ollama and pull the default model if it isn't there yet.
                tags = await client.get(f"{self.base_url}/api/tags")
                tags.raise_for_status()
                names = [m["name"] for m in tags.json().get("models", [])]
                if self.default_model not in names:
                    log.info("pulling %s ...", self.default_model)
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/api/pull",
                        json={"name": self.default_model},
                        timeout=None,
                    ) as resp:
                        async for _ in resp.aiter_lines():
                            pass
            # Warm with a tiny generation so the first real call is fast.
            async with httpx.AsyncClient(timeout=60.0) as client:
                await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.default_model,
                        "messages": [{"role": "user", "content": "hi"}],
                        "options": {"num_predict": 1},
                        "stream": False,
                    },
                )
            self._state = "ready"
            log.info("ollama ready (%s)", self.default_model)
        except Exception as exc:  # noqa: BLE001
            self._state = "error"
            self._error = str(exc)
            log.exception("LLM load failed")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 256,
    ) -> AsyncIterator[str]:
        payload = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", f"{self.base_url}/api/chat", json=payload
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    msg = chunk.get("message", {}).get("content", "")
                    if msg:
                        yield msg
                    if chunk.get("done"):
                        break
