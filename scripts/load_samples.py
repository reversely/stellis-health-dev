"""Add the AMI sample meetings without opening the app (the app's Add sample meetings does the same).

Usage: uv run python scripts/load_samples.py [--cache DIR]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from stellis import samples


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache", type=Path, default=None,
                        help="folder for downloaded recordings (kept so a rerun skips the download)")
    args = parser.parse_args()
    samples.install(args.cache)
    state = samples.status()
    if state["state"] == "failed":
        raise SystemExit(f"The samples could not be added: {state['error']}")
    print(f"{len(state['added'])} of {state['total']} sample meetings are in Stellis.")


if __name__ == "__main__":
    sys.exit(main())
