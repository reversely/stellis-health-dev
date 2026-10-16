"""Separate development identity origin; ciphertext sync is not implemented yet."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from stellis import sync_identity as identity

app = FastAPI(title="Stellis Sync Identity Dev", docs_url=None, redoc_url=None)
_STATIC = Path(__file__).parent / "sync_static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.middleware("http")
async def identity_gate(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0].lower()
    if host not in {"127.0.0.1", "localhost", "testserver"}:
        return JSONResponse({"detail": "Loopback only"}, status_code=403)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
            return JSONResponse({"detail": "Origin rejected"}, status_code=403)
    path = request.url.path
    if path == "/" or path.startswith("/static/") or path in {"/sync/v1/health", "/sync/v1/auth/register", "/sync/v1/auth/login", "/sync/v1/auth/logout"}:
        return await call_next(request)
    user = identity.current_user(request.cookies.get(identity.COOKIE))
    if user is None:
        return JSONResponse({"detail": "Login required"}, status_code=401)
    request.state.user = user
    return await call_next(request)


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=12, max_length=1024)


class DeviceName(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def _session(user_id: str, username: str) -> JSONResponse:
    response = JSONResponse({"id": user_id, "username": username})
    response.set_cookie(identity.COOKIE, identity.new_session(user_id), max_age=identity.SESSION_DAYS * 86400,
                        httponly=True, samesite="strict", secure=False, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/sync/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "identity-dev"}


@app.post("/sync/v1/auth/register")
def register(credentials: Credentials) -> JSONResponse:
    try:
        user_id = identity.register(credentials.username, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _session(user_id, credentials.username.strip())


@app.post("/sync/v1/auth/login")
def login(credentials: Credentials) -> JSONResponse:
    user_id = identity.login(credentials.username.strip(), credentials.password)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _session(user_id, credentials.username.strip())


@app.post("/sync/v1/auth/logout")
def logout(request: Request) -> JSONResponse:
    identity.revoke(request.cookies.get(identity.COOKIE))
    response = JSONResponse({"logged_out": True})
    response.delete_cookie(identity.COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/sync/v1/me")
def me(request: Request) -> dict[str, str]:
    return request.state.user


@app.post("/sync/v1/sessions/revoke-all")
def revoke_all(request: Request) -> JSONResponse:
    identity.revoke_all(request.state.user["id"])
    response = JSONResponse({"revoked": True})
    response.delete_cookie(identity.COOKIE, path="/")
    return response


@app.get("/sync/v1/devices")
def devices(request: Request) -> list[dict[str, str]]:
    return identity.devices(request.state.user["id"])


@app.post("/sync/v1/devices")
def add_device(request: Request, name: DeviceName) -> dict[str, str]:
    try:
        return identity.add_device(request.state.user["id"], name.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/sync/v1/devices/{device_id}")
def revoke_device(request: Request, device_id: str) -> dict[str, bool]:
    if not identity.revoke_device(request.state.user["id"], device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"revoked": True}
