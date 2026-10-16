"""Isolated native speech runner so ONNX inference cannot block HTTP polling."""

from __future__ import annotations

import fcntl
import sys
import uuid
from pathlib import Path

from stellis import processing, storage


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Expected one job ID")
    job_id = str(uuid.UUID(sys.argv[1]))
    lock_dir = storage.data_dir() / "job-locks"
    lock_dir.mkdir(mode=0o700, exist_ok=True)
    lock_path = lock_dir / f"{job_id}.lock"
    with lock_path.open("a+b") as lock:
        lock_path.chmod(0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        processing.run_job(job_id)


if __name__ == "__main__":
    main()
