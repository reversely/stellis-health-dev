"""Install pinned local models for the incremental Rust recording preview."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path

STREAMING_PARAKEET = "sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-streaming-560ms"
MODELS = (
    (STREAMING_PARAKEET, None),
    ("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
     "157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad"),
)
BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"
PARAKEET_BASE = ("https://huggingface.co/csukuangfj2/" + STREAMING_PARAKEET
                 + "/resolve/7551fd26fc810cc1e4e043e608db4d13b59be31e")
PARAKEET_FILES = {
    "encoder.int8.onnx": (654046389, "e566c3f014598a41724f2df028779a2d4cf7943cbefa324964f6a72e8ee255fb"),
    "decoder.int8.onnx": (7257777, "34fea72425d2506600772ba191a6d3f99c0710abdb68d9a3dc89fa8cb2aa473a"),
    "joiner.int8.onnx": (1735860, "869f43f7d24595c55581ad3bf249a935fb8a71389fbdaa7504b9f46f93140f8a"),
    "tokens.txt": (8952, "dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff"),
}
MIN_FREE_BYTES = 5 * 1024**3
REQUIRED_FILES = {
    STREAMING_PARAKEET: tuple((name,) for name in PARAKEET_FILES),
    MODELS[1][0]: (("tokens.txt",), ("encoder.onnx", "encoder.int8.onnx"),
                   ("decoder.onnx", "decoder.int8.onnx"),
                   ("joiner.onnx", "joiner.int8.onnx")),
}


def _complete(name: str, directory: Path) -> bool:
    files_present = all(any((directory / filename).is_file() for filename in choices)
                        for choices in REQUIRED_FILES[name])
    if not files_present or name != STREAMING_PARAKEET:
        return files_present
    for filename, (size, digest) in PARAKEET_FILES.items():
        path = directory / filename
        if path.stat().st_size != size:
            return False
        with path.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != digest:
                return False
    return True


def _download_streaming_parakeet(target: Path) -> None:
    target.mkdir(mode=0o700)
    try:
        for filename, (size, digest) in PARAKEET_FILES.items():
            print(f"Downloading {STREAMING_PARAKEET}/{filename}...", flush=True)
            path = target / filename
            checksum = hashlib.sha256()
            received = 0
            with urllib.request.urlopen(f"{PARAKEET_BASE}/{filename}", timeout=180) as source, \
                    path.open("wb") as output:
                while block := source.read(1024 * 1024):
                    output.write(block)
                    checksum.update(block)
                    received += len(block)
            if received != size or checksum.hexdigest() != digest:
                raise RuntimeError(f"Model checksum failed: {filename}")
        if not _complete(STREAMING_PARAKEET, target):
            raise RuntimeError("Streaming Parakeet model is incomplete")
    except BaseException:
        shutil.rmtree(target, ignore_errors=True)
        raise


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
        if name == STREAMING_PARAKEET:
            with tempfile.TemporaryDirectory(prefix=".live-asr-", dir=destination) as temp_name:
                staged = Path(temp_name) / name
                _download_streaming_parakeet(staged)
                staged.replace(target)
            print(f"Installed: {target}")
            continue
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
