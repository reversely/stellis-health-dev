"""Inspect configured routes and switch only the owner's installed local models."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
from datetime import datetime, timezone

import httpx

from stellis import agent_runtime, ai, categorization, runtime_profile, runtime_trace, storage, recording_preview, processing

_SWITCH_LOCK = threading.Lock()


def _signature():
    values = [runtime_profile.selected(), runtime_profile.model_id(),
              os.environ.get("STELLIS_NEMOCLAW_SANDBOX", ""),
              os.environ.get("NEMOCLAW_GATEWAY_PORT", ""),
              os.environ.get("STELLIS_AGENT_GATEWAY_URL", ""),
              os.environ.get("STELLIS_LOCAL_INFERENCE_URL", ""),
              os.environ.get("STELLIS_AGENT_GATEWAY_TOKEN", ""), ai._key() or ""]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


def can_switch():
    return (runtime_profile.local_inference() and os.environ.get("STELLIS_ACCOUNT_ID") == "1"
            and bool(os.environ.get("STELLIS_NEMOCLAW_SANDBOX")))


def status():
    with storage.connect() as conn:
        row = conn.execute("SELECT * FROM runtime_observations WHERE id = 1").fetchone()
    observed = json.loads(row["result_json"]) if row and row["signature"] == _signature() else None
    return {"profile": runtime_profile.selected(), "local_inference": runtime_profile.local_inference(),
            "agent_execution": "Nebius Cloud" if runtime_profile.cloud() else "GN100",
            "agent_configured": agent_runtime.configured(),
            "inference_provider": "Ollama" if runtime_profile.local_inference() else "Token Factory",
            "inference_model": runtime_profile.model_id(), "inference_configured": bool(ai._key()),
            "category_model": categorization._model_id(), "can_switch": can_switch(),
            "tutor_vision_model": (os.environ.get("STELLIS_TUTOR_VISION_MODEL", "qwen3.5:9b")
                                   if runtime_profile.local_inference() else None),
            "speech": {"live_installed": recording_preview.installed(), **processing.capabilities()["features"]},
            "observed": observed, "traces": runtime_trace.recent()}


def _cli(args, timeout=25):
    command = agent_runtime._command()
    try:
        result = subprocess.run([command, *args], capture_output=True, text=True,
                                env=agent_runtime._cli_env(command), timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("The local agent runtime did not respond") from exc
    if result.returncode or len(result.stdout) > 1_048_576:
        raise RuntimeError("The local agent runtime check failed")
    return result.stdout


def _agent_route():
    try:
        result = json.loads(_cli(["inference", "get", "--json"]))
        if not isinstance(result, dict):
            raise ValueError()
        return {key: result[key][:200] for key in ("provider", "model")
                if isinstance(result.get(key), str)}
    except (ValueError, TypeError) as exc:
        raise RuntimeError("The agent runtime returned an unreadable route") from exc


def check():
    result = {"checked_at": datetime.now(timezone.utc).isoformat(), "models": [],
              "inference": {"state": "not_configured"}, "agent": {"state": "not_configured"}}
    if ai._key():
        try:
            with httpx.Client(timeout=12, trust_env=False, follow_redirects=False) as client:
                response = client.get(runtime_profile.inference_url() + "/models",
                                      headers={"Authorization": "Bearer " + ai._key()})
            if response.status_code != 200:
                raise ValueError()
            items = response.json()["data"]
            if not isinstance(items, list):
                raise ValueError()
            result["models"] = sorted({item["id"] for item in items if isinstance(item, dict)
                                      and isinstance(item.get("id"), str) and len(item["id"]) <= 200})[:100]
            present = runtime_profile.model_id() in result["models"]
            result["inference"] = {"state": "available" if present else "model_missing"}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            result["inference"] = {"state": "unavailable"}
    if agent_runtime.configured():
        if runtime_profile.cloud():
            # Configuration is not proof of gateway health or the cloud's inference route.
            result["agent"] = {"state": "remote_unverified"}
        else:
            try:
                route = _agent_route()
                result["agent"] = {"state": "reported", **route}
                if runtime_profile.local_inference() and (route.get("model") != runtime_profile.model_id()
                                                         or route.get("provider") != "ollama-local"):
                    result["agent"]["state"] = "mismatch"
            except RuntimeError:
                result["agent"] = {"state": "unavailable"}
    with storage.connect() as conn:
        conn.execute("INSERT OR REPLACE INTO runtime_observations VALUES (1, ?, ?, ?)",
                     (_signature(), result["checked_at"], json.dumps(result)))
    return status()


def switch_model(model):
    if not can_switch():
        raise ValueError("Model switching is available to the local deployment owner")
    if not isinstance(model, str) or not model or len(model) > 200 or model.startswith("-"):
        raise ValueError("Choose an installed model")
    if not _SWITCH_LOCK.acquire(blocking=False):
        raise ValueError("A model change is already running")
    try:
        with runtime_trace.model_change():
            current = check()
            observed = current["observed"]
            if model not in observed["models"]:
                raise ValueError("Choose an installed model. Check connections to refresh the list.")
            route = observed["agent"]
            if route.get("provider") != "ollama-local" or not route.get("model"):
                raise ValueError("The agent must already use a local Ollama provider")
            previous = route["model"]
            base = runtime_profile.inference_url().removesuffix("/v1")
            try:
                with httpx.Client(timeout=15, trust_env=False, follow_redirects=False) as client:
                    response = client.post(base + "/api/show", json={"model": model})
                response.raise_for_status()
                capabilities = response.json().get("capabilities", [])
                if "tools" not in capabilities:
                    raise ValueError("This model does not support agent tools. Choose a tool-capable model.")
            except (httpx.HTTPError, TypeError) as exc:
                raise RuntimeError("Could not check this model's tool support") from exc
            sandbox = os.environ["STELLIS_NEMOCLAW_SANDBOX"]
            def apply(value):
                _cli(["inference", "set", "--provider", "ollama-local", "--model", value,
                      "--sandbox", sandbox], timeout=180)
                if _agent_route().get("model") != value:
                    raise RuntimeError("The agent runtime did not confirm the selected model")
            path = storage.data_dir() / "local-inference-model"
            temporary = path.with_suffix(".tmp")
            try:
                apply(model)
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(descriptor, "w") as output:
                    output.write(model)
                os.replace(temporary, path)
            except (RuntimeError, OSError) as exc:
                try:
                    apply(previous)
                except RuntimeError:
                    raise RuntimeError("Model change failed and the previous route could not be restored. Check connections.") from exc
                raise RuntimeError("Model change failed. The previous model was restored.") from exc
            finally:
                temporary.unlink(missing_ok=True)
        return check()
    finally:
        _SWITCH_LOCK.release()
