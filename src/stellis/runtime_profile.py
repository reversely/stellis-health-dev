"""Explicit execution profiles; cloud never falls back to a local runtime."""
import os


def selected() -> str:
    value = os.environ.get("STELLIS_RUNTIME_PROFILE", "local").strip()
    if value not in {"local", "cloud"}:
        raise ValueError("STELLIS_RUNTIME_PROFILE must be local or cloud")
    return value


def cloud() -> bool:
    return selected() == "cloud"


def local_inference() -> bool:
    # Unset preserves existing installations until an explicit profile is selected.
    selected()
    return "STELLIS_RUNTIME_PROFILE" in os.environ and selected() == "local"


def inference_url() -> str:
    if not local_inference():
        return "https://api.tokenfactory.nebius.com/v1"
    from urllib.parse import urlsplit
    url = os.environ.get("STELLIS_LOCAL_INFERENCE_URL", "http://127.0.0.1:11434/v1").rstrip("/")
    parsed = urlsplit(url)
    if (parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "::1", "localhost"}
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("Local inference must use a loopback endpoint on the GN100")
    return url


def model_id() -> str:
    if local_inference():
        return os.environ.get("STELLIS_LOCAL_INFERENCE_MODEL", "nemotron-3-nano:latest")
    return "nvidia/Nemotron-3_5-Lightning"
