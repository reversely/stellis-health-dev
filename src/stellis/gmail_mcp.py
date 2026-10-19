"""Keep the Google access token in NemoClaw's managed Gmail MCP provider current."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path

from stellis import calendar

ENDPOINT = "https://gmailmcp.googleapis.com/mcp/v1"
SERVER = "gmail"
TOKEN_ENV = "STELLIS_GMAIL_MCP_TOKEN"
_stop = threading.Event()
_wake = threading.Event()
_thread: threading.Thread | None = None
_last_token_hash: str | None = None
_log = logging.getLogger(__name__)


def _command() -> str:
    configured = os.environ.get("STELLIS_NEMOCLAW_COMMAND")
    if configured:
        return configured
    return shutil.which("nemoclaw") or str(Path.home() / ".local/bin/nemoclaw")


def _run(*args: str, token: str | None = None) -> subprocess.CompletedProcess[str]:
    command = _command()
    env = os.environ.copy()
    if os.path.isabs(command):
        # NemoClaw invokes its sibling openshell binary during bridge setup.
        env["PATH"] = str(Path(command).parent) + os.pathsep + env.get("PATH", "")
    if token is not None:
        env[TOKEN_ENV] = token
    return subprocess.run([command, *args], env=env, capture_output=True,
                          text=True, timeout=120, check=False)


def _managed_status(sandbox: str) -> dict:
    result = _run(sandbox, "mcp", "status", SERVER, "--json", "--no-probe")
    if result.returncode:
        raise RuntimeError("Could not inspect managed Gmail credential")
    try:
        status = json.loads(result.stdout)
        provider = status["provider"]
        if provider["present"] and isinstance(provider["name"], str) and provider["name"]:
            return status
    except (ValueError, KeyError, TypeError) as exc:
        raise RuntimeError("Could not inspect managed Gmail credential") from exc
    raise RuntimeError("Managed Gmail credential is missing")


def _run_openshell(*args: str) -> subprocess.CompletedProcess[str]:
    command = _command()
    sibling = Path(command).parent / "openshell" if os.path.isabs(command) else None
    openshell = str(sibling) if sibling and sibling.is_file() else (shutil.which("openshell") or "openshell")
    env = os.environ.copy()
    if os.path.isabs(openshell):
        env["PATH"] = str(Path(openshell).parent) + os.pathsep + env.get("PATH", "")
    return subprocess.run([openshell, *args], env=env, capture_output=True,
                          text=True, timeout=120, check=False)


def _remove_managed(sandbox: str) -> None:
    """Remove the adapter through NemoClaw, then retire its detached provider."""
    provider_name = str(_managed_status(sandbox)["provider"]["name"])
    removed = _run(sandbox, "mcp", "remove", SERVER)
    if removed.returncode:
        raise RuntimeError("Could not remove Gmail MCP access")
    attached = _run_openshell("sandbox", "provider", "list", sandbox)
    if attached.returncode:
        raise RuntimeError("Could not verify Gmail MCP provider detachment")
    if provider_name in {line.split()[0] for line in attached.stdout.splitlines()[1:] if line.split()}:
        raise RuntimeError("Gmail MCP provider is still attached")
    deleted = _run_openshell("provider", "delete", provider_name)
    if deleted.returncode:
        raise RuntimeError("Could not retire detached Gmail MCP credential")


def _registered(sandbox: str) -> bool:
    result = _run(sandbox, "mcp", "list", "--json")
    if result.returncode:
        raise RuntimeError("Could not inspect managed MCP servers")
    try:
        servers = json.loads(result.stdout).get("bridges", [])
        return any(server.get("server") == SERVER for server in servers)
    except (ValueError, AttributeError, TypeError) as exc:
        raise RuntimeError("Could not read managed MCP server list") from exc


async def sync_once() -> None:
    """Refresh the Google token and replace the managed MCP credential if needed."""
    global _last_token_hash
    sandbox = os.environ.get("STELLIS_NEMOCLAW_SANDBOX", "").strip()
    if not sandbox:
        return
    connected = next(item for item in calendar.connections() if item["provider"] == "google")
    if not connected["mail_connected"]:
        if await asyncio.to_thread(_registered, sandbox):
            await asyncio.to_thread(_remove_managed, sandbox)
        _last_token_hash = None
        return
    token = await calendar._access_token("google", min_validity=600)
    if token is None:
        return
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    registered = await asyncio.to_thread(_registered, sandbox)
    if token_hash == _last_token_hash and registered:
        status = await asyncio.to_thread(_managed_status, sandbox)
        if status["adapter"]["registered"] and status["provider"]["state"] == "configured":
            return
    if registered:
        await asyncio.to_thread(_remove_managed, sandbox)
    added = await asyncio.to_thread(
        _run, sandbox, "mcp", "add", SERVER, "--url", ENDPOINT, "--env", TOKEN_ENV,
        "--deny-tool", "get_message", "--deny-tool", "list_drafts",
        "--deny-tool", "list_labels", "--deny-tool", "label_*",
        "--deny-tool", "unlabel_*", token=token)
    if added.returncode:
        raise RuntimeError("Could not register Gmail MCP credential")
    _last_token_hash = token_hash


def _loop() -> None:
    while not _stop.is_set():
        try:
            asyncio.run(sync_once())
        except (calendar.CalendarError, OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            # A failed rotation leaves Gmail unavailable; the next tick retries it.
            _log.warning("Gmail MCP sync failed: %s", exc)
        _wake.wait(300)
        _wake.clear()


def start() -> None:
    global _thread
    if (not os.environ.get("STELLIS_NEMOCLAW_SANDBOX")
            or os.environ.get("STELLIS_GMAIL_MCP_SYNC") == "off"):
        return
    if _thread is None or not _thread.is_alive():
        _stop.clear()
        _thread = threading.Thread(target=_loop, name="stellis-gmail-mcp", daemon=True)
        _thread.start()


def wake() -> None:
    _wake.set()


def stop() -> None:
    _stop.set()
    _wake.set()
    if _thread is not None:
        _thread.join(timeout=125)
