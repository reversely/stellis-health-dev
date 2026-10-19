"""Account-local Tavily credential status and storage."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from stellis import storage


def _file() -> Path:
    return storage.data_dir() / "tavily-api-key"


def saved_key() -> str | None:
    try:
        return _file().read_text().strip() or None
    except FileNotFoundError:
        return None


def available_key() -> str | None:
    """Use this account's saved key, with the owner's existing host key as fallback."""
    saved = saved_key()
    if saved:
        return saved
    if os.environ.get("STELLIS_ACCOUNT_ID", "1") != "1":
        return None
    value = os.environ.get("TAVILY_API_KEY")
    if value:
        return value
    path = Path(__file__).resolve().parents[2] / ".env"
    if path.is_file():
        for line in path.read_text().splitlines():
            if line.startswith("TAVILY_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


async def search(query: str, limit: int = 3) -> list[dict[str, object]]:
    """Fetch bounded external evidence for this account's research job."""
    key = available_key()
    if not key:
        raise ValueError("Add a Tavily API key in Settings")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post("https://api.tavily.com/search",
                                         headers={"Authorization": f"Bearer {key}"},
                                         json={"query": query[:1000], "max_results": max(1, min(limit, 5)),
                                               "include_answer": False, "include_raw_content": False})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ValueError("Tavily search failed. Check the key in Settings.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("Tavily search failed. Try again.")
    results = []
    for item in payload["results"][:limit]:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url", ""))
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            continue
        results.append({"source_id": url, "title": str(item.get("title", ""))[:160] or parsed.netloc,
                        "excerpt": str(item.get("content", ""))[:1400],
                        "target": url, "start_ms": None})
    return results


def key_status() -> dict[str, object]:
    """Report availability without returning the credential."""
    if saved_key():
        return {"configured": True, "source": "saved"}
    if available_key():
        return {"configured": True, "source": "environment"}
    return {"configured": False, "source": None}


def save_key(value: str) -> dict[str, object]:
    key = value.strip()
    if not 16 <= len(key) <= 512 or any(character.isspace() for character in key):
        raise ValueError("Enter the Tavily API key exactly as shown")
    path = _file()
    descriptor = os.open(path.with_suffix(".tmp"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(key)
            output.flush()
            os.fsync(output.fileno())
        os.replace(path.with_suffix(".tmp"), path)
    finally:
        path.with_suffix(".tmp").unlink(missing_ok=True)
    return key_status()


def remove_key() -> dict[str, object]:
    _file().unlink(missing_ok=True)
    return key_status()
