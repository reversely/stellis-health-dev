"""Authenticated cloud OpenClaw transport; never starts a local runtime."""

from __future__ import annotations

import asyncio
import json
import os
from urllib.parse import urlsplit

import httpx


class GatewayError(Exception):
    """A safe runtime error without credentials or remote response bodies."""


def _settings() -> tuple[str, str]:
    # A gateway credential grants operator access. Bind it to one Stellis account.
    account = os.environ.get("STELLIS_ACCOUNT_ID", "")
    owner = os.environ.get("STELLIS_AGENT_GATEWAY_ACCOUNT_ID", "")
    endpoint = os.environ.get("STELLIS_AGENT_GATEWAY_URL", "").strip().rstrip("/")
    token = os.environ.get("STELLIS_AGENT_GATEWAY_TOKEN", "").strip()
    parsed = urlsplit(endpoint)
    if (not account or not owner or account != owner or not token or parsed.scheme != "https" or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise GatewayError("Connect the cloud agent service first")
    return endpoint, token


def configured() -> bool:
    try:
        _settings()
        return True
    except (GatewayError, ValueError):
        return False


def _reply(payload: object) -> str:
    if not isinstance(payload, dict) or payload.get("status") != "completed":
        raise GatewayError("Agent reply failed. Try again.")
    output = payload.get("output")
    if not isinstance(output, list):
        raise GatewayError("Agent reply failed. Try again.")
    texts = []
    for item in output:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        if item.get("role") != "assistant" or not isinstance(item.get("content"), list):
            continue
        for part in item["content"]:
            if (isinstance(part, dict) and part.get("type") == "output_text"
                    and isinstance(part.get("text"), str)):
                texts.append(part["text"])
    answer = "\n".join(texts).strip()
    if not answer:
        raise GatewayError("Agent reply failed. Try again.")
    return answer


async def turn(prompt: str, session_id: str) -> tuple[str, str]:
    """Run one isolated job via OpenClaw's documented Responses endpoint.

    Closing this request cancels the gateway run, including on task cancellation.
    No retries occur here: callers own durable jobs and answer-format retries.
    """
    endpoint, token = _settings()
    if not session_id or len(session_id) > 200 or any(c not in
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in session_id):
        raise GatewayError("Invalid agent session")
    headers = {"Authorization": "Bearer " + token,
               "x-openclaw-session-key": "stellis-" + session_id}
    try:
        async with asyncio.timeout(150):
            async with httpx.AsyncClient(timeout=150, follow_redirects=False, trust_env=False) as client:
                async with client.stream("POST", endpoint + "/v1/responses", headers=headers,
                        json={"model": "openclaw/main", "input": prompt, "stream": False}) as response:
                    if response.status_code != 200:
                        raise GatewayError("Cloud agent service is unavailable. Try again.")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 1_048_576:
                            raise GatewayError("Agent reply was too long. Try again.")
        return _reply(json.loads(body)), session_id
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise GatewayError("Agent reply timed out. Try again.") from exc
    except (httpx.HTTPError, ValueError, UnicodeError) as exc:
        raise GatewayError("Cloud agent reply failed. Try again.") from exc
