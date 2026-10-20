"""Route authenticated browser requests to isolated account-local Stellis processes."""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from stellis import auth, calendar, server, storage
from stellis.processing import model_paths

_PUBLIC = {"/auth", "/api/health", "/api/v1/health"}
_HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
                "te", "trailers", "transfer-encoding", "upgrade"}


class AccountGateway:
    """One account registry in front of separate local workspace processes."""

    def __init__(self) -> None:
        self.children: dict[int, subprocess.Popen] = {}
        self.locks: dict[int, asyncio.Lock] = {}
        self.root = storage.data_dir()
        runtime = os.environ.get("STELLIS_ACCOUNT_SOCKET_DIR")
        self.socket_dir = Path(runtime) if runtime else self.root / ".account-sockets"
        self.socket_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.socket_dir.chmod(0o700)

    def _socket(self, account_id: int) -> Path:
        return self.socket_dir / f"{account_id}.sock"

    async def _ready(self, account_id: int) -> Path:
        lock = self.locks.setdefault(account_id, asyncio.Lock())
        async with lock:
            process = self.children.get(account_id)
            socket = self._socket(account_id)
            if process and process.poll() is None and socket.exists():
                return socket
            if process and process.poll() is None:
                process.terminate()
                await asyncio.to_thread(process.wait, 10)
            socket.unlink(missing_ok=True)
            account_root = self.root if account_id == 1 else self.root / "accounts" / str(account_id)
            account_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            account_root.chmod(0o700)
            env = os.environ.copy()
            model_files = model_paths()  # Resolve shared device models before changing the child data root.
            env.update(STELLIS_DATA_DIR=str(account_root), STELLIS_AUTH_DB_DIR=str(self.root),
                       STELLIS_ACCOUNT_ID=str(account_id), STELLIS_AUTH_MODE="required",
                       STELLIS_WHISPER_MODEL=str(model_files[0]),
                       STELLIS_SEGMENTATION_MODEL=str(model_files[1]),
                       STELLIS_EMBEDDING_MODEL=str(model_files[2]))
            if account_id != 1:
                for key in ("NEBIUS_API_KEY", "TAVILY_API_KEY", "STELLIS_MCP_TOKEN",
                            "STELLIS_NEMOCLAW_SANDBOX", "STELLIS_TAVILY_MCP_READY",
                            "STELLIS_AGENT_GATEWAY_URL", "STELLIS_AGENT_GATEWAY_TOKEN",
                            "STELLIS_AGENT_GATEWAY_ACCOUNT_ID", "STELLIS_AGENT_GATEWAY_TAVILY_READY"):
                    env.pop(key, None)
            command = [sys.executable, "-m", "uvicorn", "stellis.server:app", "--uds", str(socket),
                       "--no-access-log"]
            process = subprocess.Popen(command, env=env, cwd=Path.cwd(),
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.children[account_id] = process
            for _ in range(150):
                if process.poll() is not None:
                    break
                if socket.exists():
                    try:
                        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=str(socket)),
                                                     timeout=1) as client:
                            response = await client.get("http://stellis/api/health")
                        if response.status_code == 200:
                            return socket
                    except (httpx.HTTPError, OSError):
                        pass
                await asyncio.sleep(0.1)
            raise RuntimeError("Account workspace could not start")

    async def _proxy(self, request: Request, account_id: int) -> Response:
        client = None
        try:
            socket = await self._ready(account_id)
            client = httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=str(socket)), timeout=180)
            headers = {key: value for key, value in request.headers.items() if key.lower() not in _HOP_HEADERS}
            scope_query = request.scope.get("query_string", b"").decode("latin-1")
            url = f"http://stellis{request.url.path}" + (f"?{scope_query}" if scope_query else "")
            outbound = client.build_request(request.method, url, headers=headers, content=request.stream())
            upstream = await client.send(outbound, stream=True)
        except (RuntimeError, httpx.HTTPError, OSError):
            if client is not None:
                await client.aclose()
            return JSONResponse({"detail": "Account workspace unavailable"}, status_code=503)

        deleted = request.method == "DELETE" and request.url.path == "/api/v1/account" and upstream.status_code == 200

        async def close() -> None:
            await upstream.aclose()
            await client.aclose()
            if deleted:
                process = self.children.pop(account_id, None)
                if process is not None and process.poll() is None:
                    process.terminate()
                    try:
                        await asyncio.to_thread(process.wait, 10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        await asyncio.to_thread(process.wait)
                self._socket(account_id).unlink(missing_ok=True)
                if account_id != 1:
                    await asyncio.to_thread(shutil.rmtree, self.root / "accounts" / str(account_id), True)

        response_headers = {key: value for key, value in upstream.headers.items()
                            if key.lower() not in _HOP_HEADERS}
        return StreamingResponse(upstream.aiter_raw(), status_code=upstream.status_code,
                                 headers=response_headers, background=BackgroundTask(close))

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    for process in self.children.values():
                        if process.poll() is None:
                            process.terminate()
                    for process in self.children.values():
                        if process.poll() is None:
                            try:
                                await asyncio.to_thread(process.wait, 10)
                            except subprocess.TimeoutExpired:
                                process.kill()
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            await Response(status_code=404)(scope, receive, send)
            return
        request = Request(scope, receive)
        path = request.url.path
        if (path in _PUBLIC or path.startswith(("/static/", "/shared/", "/api/v1/auth/"))):
            await server.app(scope, receive, send)
            return
        if request.method == "GET" and path in {
                "/api/v1/calendar/google/callback", "/api/v1/calendar/microsoft/callback"}:
            account_id = calendar.callback_account(path.split("/")[-2], request.query_params.get("state", ""))
            if account_id is None:
                await RedirectResponse("/onboarding?calendar=expired", status_code=303)(scope, receive, send)
                return
        elif path == "/mcp":
            account_id = 1  # Existing bearer-protected managed MCP belongs to the owner workspace.
        else:
            account_id = auth.current_account_id(request.cookies.get(auth.COOKIE_NAME))
            if account_id is None:
                response = (JSONResponse({"detail": "Login required"}, status_code=401)
                            if path.startswith("/api/") else RedirectResponse("/auth", status_code=303))
                await response(scope, receive, send)
                return
        response = await self._proxy(request, account_id)
        await response(scope, receive, send)


app = AccountGateway()
