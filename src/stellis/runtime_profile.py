"""Separate agent execution from model inference for each explicit profile."""
import os


def selected() -> str:
    value = os.environ.get("STELLIS_RUNTIME_PROFILE", "local").strip()
    if value not in {"local", "cloud", "direct"}:
        raise ValueError("STELLIS_RUNTIME_PROFILE must be local, cloud or direct")
    return value


def cloud() -> bool:
    return selected() == "cloud"


def direct() -> bool:
    """Agent turns call Token Factory from this process, with no agent sandbox or tools."""
    return selected() == "direct"


def remote_agents() -> bool:
    """Use HTTP: cloud calls managed OpenClaw; direct and demo call inference."""
    from stellis import storage
    return storage.in_demo() or selected() in {"cloud", "direct"}


def shared_provider_keys() -> bool:
    """The deployment supplies provider keys and models to every account, which configure none."""
    return os.environ.get("STELLIS_SHARED_PROVIDER_KEYS") == "1"


def operator() -> bool:
    """This account may change provider keys and model routes: every account unless keys are shared, then only the owner."""
    return not shared_provider_keys() or os.environ.get("STELLIS_ACCOUNT_ID", "1") == "1"


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


def _default_text_model() -> str:
    if local_inference():
        from stellis import storage
        path = storage.base_dir() / "local-inference-model"
        if path.is_file():
            value = path.read_text().strip()
            if value and len(value) <= 200:
                return value
        return os.environ.get("STELLIS_LOCAL_INFERENCE_MODEL", "nemotron-3-nano:latest")
    return "nvidia/Nemotron-3_5-Lightning"


def model_id(role: str = "transcript") -> str:
    from stellis import model_routes
    if role not in model_routes.ROLES:
        raise ValueError("Unknown inference role")
    saved = model_routes.choices().get(role)
    if saved:
        return saved
    if role == "categories" and not local_inference():
        return "zai-org/GLM-5.3-Flash"
    return _default_text_model()


def agent_execution() -> str:
    """Describe the agent execution path, including the isolated demo exception."""
    from stellis import storage
    if storage.in_demo():
        return "Direct Ollama (demo)" if local_inference() else "Direct Token Factory (demo)"
    if direct():
        return "Direct Token Factory (legacy)"
    return "NemoClaw on Nebius Cloud" if cloud() else "NemoClaw on GN100"


def label() -> str:
    """Name the configured version separately from its model provider."""
    from stellis import storage
    if storage.in_demo() or direct():
        return agent_execution()
    if cloud():
        return "Cloud NemoClaw + Token Factory"
    return "Local NemoClaw + Ollama" if local_inference() else "Legacy GN100 NemoClaw + Token Factory"
