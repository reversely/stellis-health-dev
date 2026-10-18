"""Add the sample workspace without opening the app (the app's Add sample workspace does the same).

Usage: uv run python scripts/load_samples.py [--cache DIR] [--remove]
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
    parser.add_argument("--remove", action="store_true", help="remove the sample workspace instead of adding it")
    args = parser.parse_args()
    if args.remove:
        samples.remove()
        print("The sample workspace was removed.")
        return
    samples.install(args.cache)
    state = samples.status()
    if state["state"] == "failed":
        raise SystemExit(f"The sample workspace could not be added: {state['error']}")
    print(f"The sample workspace is in Stellis, with {len(state['added'])} of {state['total']} sample meetings.")


if __name__ == "__main__":
    sys.exit(main())
