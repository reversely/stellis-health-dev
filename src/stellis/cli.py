"""Command line entry point for the local browser app."""

from __future__ import annotations

import argparse
import os

import uvicorn

from stellis import models, tools
from stellis.processing import model_paths


def main() -> None:
    """Start the browser app or report local speech-tool readiness."""
    parser = argparse.ArgumentParser(prog="stellis")
    parser.add_argument("--port", type=int, default=8765, help="port for the local browser app")
    command = parser.add_subparsers(dest="command")
    serve = command.add_parser("serve", help="Start the local browser app (the default)")
    serve.add_argument("--port", type=int, default=8765)
    command.add_parser("setup", help="Download the speech models now")
    sync_serve = command.add_parser("sync-serve", help="Start the separate development account service")
    sync_serve.add_argument("--port", type=int, default=8769)
    command.add_parser("doctor", help="Check the speech tools and models")
    args = parser.parse_args()
    args.command = args.command or "serve"

    if args.command == "doctor":
        print(f"ffmpeg: {tools.ffmpeg()}")
        print("whisper.cpp: pywhispercpp")
        for label, model in zip(("whisper model", "segmentation model", "speaker embedding model"), model_paths()):
            print(f"{label}: {model if model.is_file() else 'missing (downloads when Stellis starts)'}")
        return
    if args.command == "setup":
        if not models.missing():
            print(f"Speech models are ready in {models.directory()}")
            return
        print(f"Downloading speech models to {models.directory()} …")
        models.install()
        state = models.status()
        if state["state"] != "ready":
            raise SystemExit(f"Model download failed: {state['error']}")
        print("Speech models are ready.")
        return

    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    # Loopback unless a hosted deployment sets STELLIS_HOST behind its own TLS proxy.
    host = os.environ.get("STELLIS_HOST", "127.0.0.1")
    if args.command == "serve":
        os.environ.setdefault("STELLIS_AUTH_MODE", "required")
        models.ensure_in_background()
        print(f"Stellis Health is running at http://{host}:{args.port}/")
    target = ("stellis.sync_server:app" if args.command == "sync-serve" else
              "stellis.account_gateway:app" if os.environ.get("STELLIS_AUTH_MODE") == "required" else
              "stellis.server:app")
    uvicorn.run(target, host=host, port=args.port, **proxy_options())


def proxy_options() -> dict[str, object]:
    """Trust X-Forwarded-Proto only from the hosts a TLS proxy deployment names, so origin checks see https."""
    trusted = os.environ.get("STELLIS_FORWARDED_ALLOW_IPS", "").strip()
    return {"proxy_headers": True, "forwarded_allow_ips": trusted} if trusted else {"proxy_headers": False}
