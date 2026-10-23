"""Operator-configured Chatterbox speech transport for call replies."""

import io
import ipaddress
import os
from urllib.parse import urlsplit

import httpx

MAX_AUDIO_BYTES = 16 * 1024 * 1024


def backend() -> str:
    value = os.environ.get("STELLIS_TTS_BACKEND", "cpu")
    if value not in {"cpu", "local", "nebius"}:
        raise ValueError("STELLIS_TTS_BACKEND must be cpu, local or nebius")
    return value


def speak(text: str) -> tuple[bytes, int]:
    """Request bounded WAV audio and convert it to the browser's mono PCM."""
    import numpy as np
    import soundfile as sf

    kind = backend()
    if kind == "cpu":
        raise ValueError("CPU speech uses the call engine")
    prefix = "STELLIS_CHATTERBOX_" + kind.upper()
    url = os.environ.get(prefix + "_URL", "http://127.0.0.1:8010" if kind == "local" else "")
    parsed = urlsplit(url)
    try:
        loopback = ipaddress.ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        loopback = parsed.hostname == "localhost"
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment
            or (parsed.scheme != "https" and not (kind == "local" and loopback and parsed.scheme == "http"))):
        raise ValueError("Chatterbox requires HTTPS or a local loopback HTTP URL")
    token = os.environ.get(prefix + "_TOKEN", "")
    if kind == "nebius" and not token:
        raise ValueError("Set STELLIS_CHATTERBOX_NEBIUS_TOKEN on the server")
    headers = {"Authorization": "Bearer " + token} if token else {}
    body = {"model": "tts-1", "input": text,
            "voice": os.environ.get("STELLIS_CHATTERBOX_VOICE", "default"),
            "response_format": "wav"}
    # Redirects and environment proxies must not forward credentials to another host.
    with httpx.Client(timeout=httpx.Timeout(120, connect=10), trust_env=False) as client:
        with client.stream("POST", url.rstrip("/") + "/v1/audio/speech",
                           headers=headers, json=body) as response:
            if response.status_code != 200:
                raise RuntimeError(f"Chatterbox speech failed (HTTP {response.status_code})")
            payload = bytearray()
            for chunk in response.iter_bytes():
                payload.extend(chunk)
                if len(payload) > MAX_AUDIO_BYTES:
                    raise RuntimeError("Chatterbox audio exceeds the response limit")
    with sf.SoundFile(io.BytesIO(payload)) as audio:
        if audio.format != "WAV" or audio.channels != 1 or not 8000 <= audio.samplerate <= 48000:
            raise RuntimeError("Chatterbox must return mono WAV at 8 to 48 kHz")
        if not 0 < audio.frames <= 120 * audio.samplerate:
            raise RuntimeError("Chatterbox audio must contain at most 120 seconds")
        samples = audio.read(dtype="float32")
        rate = audio.samplerate
    if not np.isfinite(samples).all():
        raise RuntimeError("Chatterbox returned invalid samples")
    return (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes(), rate
