"""Account-local Tavily credential status and storage."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from stellis import runtime_profile, storage

_MANAGED_LOCK = threading.Lock()


def _file() -> Path:
    return storage.data_dir() / "tavily-api-key"


def saved_key() -> str | None:
    try:
        return _file().read_text().strip() or None
    except FileNotFoundError:
        return None


def _host_key() -> str | None:
    """Read the owner's host fallback, or the deployment key every account shares."""
    if os.environ.get("STELLIS_ACCOUNT_ID", "1") != "1" and os.environ.get("STELLIS_SHARED_PROVIDER_KEYS") != "1":
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


def available_key() -> str | None:
    """Use this account's saved key, with the owner's existing host key as fallback."""
    return saved_key() or _host_key()


def _managed_sandbox() -> str | None:
    if runtime_profile.cloud():
        return None
    if os.environ.get("STELLIS_ACCOUNT_ID") != "1":
        return None
    return os.environ.get("STELLIS_NEMOCLAW_SANDBOX", "").strip() or None


def _sync_managed(key: str | None) -> None:
    """Recreate the owner Tavily bridge through NemoClaw's managed lifecycle."""
    sandbox = _managed_sandbox()
    if not sandbox:
        return
    command = shutil.which("nemoclaw") or str(Path.home() / ".local/bin/nemoclaw")
    openshell = shutil.which("openshell") or str(Path(command).parent / "openshell")
    env = os.environ.copy()
    env["PATH"] = str(Path(command).parent) + os.pathsep + env.get("PATH", "")
    if key:
        env["STELLIS_TAVILY_MCP_TOKEN"] = key
    else:
        env.pop("STELLIS_TAVILY_MCP_TOKEN", None)

    def run(argv: list[str], timeout: int = 150) -> subprocess.CompletedProcess:
        try:
            return subprocess.run(argv, env=env, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("Could not update managed Tavily access") from exc

    base = [command, sandbox, "mcp"]
    if run([*base, "remove", "tavily", "--force"]).returncode:
        raise RuntimeError("Could not update managed Tavily access")
    # NemoClaw deliberately preserves an ambiguous detached provider on removal.
    run([openshell, "provider", "delete", f"{sandbox}-mcp-tavily"], 30)
    if key:
        if run([*base, "add", "tavily", "--url", "https://mcp.tavily.com/mcp/",
                "--env", "STELLIS_TAVILY_MCP_TOKEN"]).returncode:
            raise RuntimeError("Could not update managed Tavily access")
        status = run([*base, "status", "tavily", "--json", "--no-probe"], 30)
        try:
            state = json.loads(status.stdout)
        except ValueError as exc:
            raise RuntimeError("Could not verify managed Tavily access") from exc
        if (status.returncode or not state.get("provider", {}).get("credentialReady")
                or not state.get("adapter", {}).get("registered")):
            raise RuntimeError("Could not verify managed Tavily access")
    # Refresh the other managed bridge if NemoClaw's adapter revision changed.
    if env.get("STELLIS_MCP_TOKEN"):
        if run([*base, "restart", "stellis"], 90).returncode:
            raise RuntimeError("Could not refresh the managed Stellis tool")


def key_status() -> dict[str, object]:
    """Report availability without returning the credential."""
    if runtime_profile.cloud():
        from stellis import agent_gateway
        ready = agent_gateway.configured() and os.environ.get("STELLIS_AGENT_GATEWAY_TAVILY_READY") == "1"
        return {"configured": ready, "source": "cloud" if ready else None, "managed_ready": ready}
    managed_ready = bool(_managed_sandbox() and os.environ.get("STELLIS_TAVILY_MCP_READY") == "1")
    if saved_key():
        return {"configured": True, "source": "saved", "managed_ready": managed_ready}
    if available_key():
        return {"configured": True, "source": "environment", "managed_ready": managed_ready}
    return {"configured": False, "source": None, "managed_ready": False}


def save_key(value: str) -> dict[str, object]:
    key = value.strip()
    if not 16 <= len(key) <= 512 or any(character.isspace() for character in key):
        raise ValueError("Enter the Tavily API key exactly as shown")
    with _MANAGED_LOCK:
        previous = available_key()
        changed = bool(_managed_sandbox() and key != previous)
        if changed:
            try:
                _sync_managed(key)
            except RuntimeError:
                if previous:
                    try:
                        _sync_managed(previous)
                    except RuntimeError:
                        pass
                raise
        path = _file()
        try:
            descriptor = os.open(path.with_suffix(".tmp"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            try:
                with os.fdopen(descriptor, "w") as output:
                    output.write(key)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(path.with_suffix(".tmp"), path)
            finally:
                path.with_suffix(".tmp").unlink(missing_ok=True)
        except OSError:
            if changed and previous:
                try:
                    _sync_managed(previous)
                except RuntimeError:
                    pass
            raise
        return key_status()


def remove_key() -> dict[str, object]:
    with _MANAGED_LOCK:
        saved = saved_key()
        fallback = _host_key()
        if saved and _managed_sandbox() and saved != fallback:
            try:
                _sync_managed(fallback)
            except RuntimeError:
                try:
                    _sync_managed(saved)
                except RuntimeError:
                    pass
                raise
        _file().unlink(missing_ok=True)
        return key_status()
