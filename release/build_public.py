"""Build the public stellis tree from a stellis-dev commit, scan it for private text, and test it.

Usage:
  python release/build_public.py OUT_DIR [--ref REF] [--test]

The tree is the commit's files minus release/public-exclude.txt. The build fails
when any file matches release/private-patterns.txt, or contains a recording,
database, or .env file. With --test it installs the tree and runs the suite.
"""

from __future__ import annotations

import argparse
import io
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = {".png", ".wav", ".woff2", ".bin", ".onnx", ".jpg", ".webp", ".ico"}
LOCKFILES = {"uv.lock", "package-lock.json"}
FORBIDDEN_FILES = (".env", "*.sqlite3", "*.mp3", "*.m4a", "*.webm", "*.zip")


def _lines(name: str) -> list[str]:
    text = (ROOT / "release" / name).read_text()
    return [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")]


def export(ref: str, out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    archive = subprocess.run(["git", "-C", str(ROOT), "archive", ref], check=True, capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(out, filter="data")
    for entry in _lines("public-exclude.txt"):
        target = out / entry.rstrip("/")
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()


def scan(out: Path) -> list[str]:
    patterns = re.compile("|".join(_lines("private-patterns.txt")), re.IGNORECASE)
    findings = []
    for path in sorted(out.rglob("*")):
        if not path.is_file() or path.suffix in BINARY or path.name in LOCKFILES:
            continue
        for number, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
            if patterns.search(line):
                findings.append(f"{path.relative_to(out)}:{number}: {line.strip()[:120]}")
    for pattern in FORBIDDEN_FILES:
        findings += [f"{path.relative_to(out)}: file type never published" for path in out.rglob(pattern)]
    return findings


def test(out: Path) -> bool:
    subprocess.run(["uv", "sync", "--locked", "-q"], cwd=out, check=True)
    result = subprocess.run(["uv", "run", "--locked", "python", "-m", "unittest", "discover", "-s", "tests"], cwd=out)
    shutil.rmtree(out / ".venv", ignore_errors=True)
    for cache in out.rglob("__pycache__"):
        shutil.rmtree(cache)
    return result.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and check the public stellis tree.")
    parser.add_argument("out", type=Path)
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()
    export(args.ref, args.out)
    findings = scan(args.out)
    for finding in findings:
        print("PRIVATE", finding)
    if findings:
        print(f"Stopped: {len(findings)} private finding(s). Nothing was published.")
        return 1
    files = sum(1 for path in args.out.rglob("*") if path.is_file())
    print(f"Public tree: {files} files, no private findings.")
    if args.test and not test(args.out):
        print("Stopped: tests failed.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
