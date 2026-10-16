"""Command line entry point for the local browser app."""

from __future__ import annotations

import argparse
import os
import shutil

import uvicorn

from stellis.processing import model_paths


def main() -> None:
    """Start the browser app or report local speech-tool readiness."""
    parser = argparse.ArgumentParser(prog="stellis")
    command = parser.add_subparsers(dest="command", required=True)
    serve = command.add_parser("serve", help="Start the local browser app")
    serve.add_argument("--port", type=int, default=8765)
    sync_serve = command.add_parser("sync-serve", help="Start the separate development account service")
    sync_serve.add_argument("--port", type=int, default=8769)
    command.add_parser("doctor", help="Check local audio tools")
    args = parser.parse_args()

    if args.command == "doctor":
        for tool in ("ffmpeg", "ffprobe", "whisper-cli"):
            print(f"{tool}: {shutil.which(tool) or 'missing'}")
        for label, model in zip(("whisper model", "segmentation model", "speaker embedding model"), model_paths()):
            print(f"{label}: {model if model.is_file() else 'missing'}")
        return

    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if args.command == "serve":
        os.environ.setdefault("STELLIS_AUTH_MODE", "required")
    uvicorn.run("stellis.sync_server:app" if args.command == "sync-serve" else "stellis.server:app",
                host="127.0.0.1", port=args.port)
