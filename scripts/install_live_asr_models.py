"""Install pinned local models for the incremental Rust recording preview."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path

MODELS = (
    ("sherpa-onnx-streaming-zipformer-en-2023-06-21",
     "455f40e556aa2b20ac9d3bffd603b58002075c1193b4070938540c11efe0a4da"),
    ("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
     "157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad"),
)
BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"
MIN_FREE_BYTES = 5 * 1024**3
REQUIRED_FILES = {
    MODELS[0][0]: (("tokens.txt",), ("encoder.onnx", "encoder-epoch-99-avg-1.int8.onnx"),
                   ("decoder.onnx", "decoder-epoch-99-avg-1.onnx"),
                   ("joiner.onnx", "joiner-epoch-99-avg-1.int8.onnx")),
    MODELS[1][0]: (("tokens.txt",), ("encoder.onnx", "encoder.int8.onnx"),
                   ("decoder.onnx", "decoder.int8.onnx"),
                   ("joiner.onnx", "joiner.int8.onnx")),
}


def _complete(name: str, directory: Path) -> bool:
    return all(any((directory / filename).is_file() for filename in choices)
               for choices in REQUIRED_FILES[name])


def install(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name, expected in MODELS:
        target = destination / name
        if target.exists():
            if not _complete(name, target):
                raise RuntimeError(f"Incomplete model directory: {target}")
            print(f"Already installed: {target}")
            continue
        if shutil.disk_usage(destination).free < MIN_FREE_BYTES:
            raise RuntimeError("At least 5 GiB free is required before downloading speech models")
        with tempfile.TemporaryDirectory(prefix=".live-asr-", dir=destination) as temp_name:
            temp = Path(temp_name)
            archive = temp / f"{name}.tar.bz2"
            print(f"Downloading {name}...", flush=True)
            with urllib.request.urlopen(f"{BASE}/{name}.tar.bz2", timeout=90) as source, archive.open("wb") as output:
                shutil.copyfileobj(source, output)
            with archive.open("rb") as saved:
                digest = hashlib.file_digest(saved, "sha256").hexdigest()
            if digest != expected:
                raise RuntimeError(f"Model checksum failed: {name}")
            with tarfile.open(archive, "r:bz2") as bundle:
                bundle.extractall(temp, filter="data")
            extracted = temp / name
            if not _complete(name, extracted):
                raise RuntimeError(f"Model archive is incomplete: {name}")
            extracted.replace(target)
            print(f"Installed: {target}")
    print("Set STELLIS_ONLINE_ASR_MODEL_DIR to", destination / MODELS[0][0])
    print("Set STELLIS_PARAKEET_MODEL_DIR to", destination / MODELS[1][0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    install(parser.parse_args().destination.expanduser())
