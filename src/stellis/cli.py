"""Command line entry point for the local browser app."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

import uvicorn


def main() -> None:
    """Start the browser app or report local speech-tool readiness."""
    parser = argparse.ArgumentParser(prog="stellis")
    command = parser.add_subparsers(dest="command", required=True)
    serve = command.add_parser("serve", help="Start the local browser app")
    serve.add_argument("--port", type=int, default=8765)
    command.add_parser("doctor", help="Check local audio tools")
    args = parser.parse_args()

    if args.command == "doctor":
        for tool in ("ffmpeg", "ffprobe", "whisper-cli"):
            print(f"{tool}: {shutil.which(tool) or 'missing'}")
        model = Path(
            os.environ.get(
                "STELLIS_WHISPER_MODEL",
                str(Path.home() / ".cache/stellis/models/ggml-small.en.bin"),
            )
        )
        print(f"whisper model: {model if model.is_file() else 'missing'}")
        return

    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    uvicorn.run("stellis.server:app", host="127.0.0.1", port=args.port)
