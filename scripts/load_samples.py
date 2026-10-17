"""Add sample meetings from the AMI Meeting Corpus to Stellis.

The AMI Meeting Corpus is published by the University of Edinburgh under the
Creative Commons Attribution 4.0 licence (https://groups.inf.ed.ac.uk/ami/corpus/license.shtml).
Each sample is a real four-person design meeting. This script downloads the
mixed headset recording, checks its SHA-256 digest, converts it to MP3, and
imports it like any other recording. Transcription then runs in the app.

Usage: uv run python scripts/load_samples.py [--cache DIR]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from starlette.datastructures import UploadFile

from stellis import importer, library, notes, processing, storage, tools

SOURCE = "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/{id}/audio/{id}.Mix-Headset.wav"
SAMPLES = (
    ("ES2002a", "Remote control design kickoff", "9c76866990fcc8b84006dc32d273ad99df439090b748ebe72103bb78c3216ee7"),
    ("IS1008a", "Product team introductions and goals", "75ae8796ca2177fa0c77055de2fe2f95325b412dc7152a9b32c76c9884a3d382"),
    ("TS3003a", "New remote control project planning", "b6ce59ff735c234afdd94b13744aa26f6785af746170543fd03b33160e920a6d"),
)
CREDIT = ("Sample meeting {id} from the AMI Meeting Corpus, University of Edinburgh, "
          "licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). "
          "The participants are actors in a design scenario.")


def _download(meeting: str, digest: str, cache: Path) -> Path:
    path = cache / f"{meeting}.Mix-Headset.wav"
    if not path.is_file():
        print(f"Downloading {meeting}…", flush=True)
        partial = path.with_suffix(".part")
        urllib.request.urlretrieve(SOURCE.format(id=meeting), partial)
        partial.replace(path)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != digest:
        path.unlink()
        raise SystemExit(f"{meeting} did not match its published checksum; run the script again.")
    return path


def _to_mp3(source: Path, target: Path) -> None:
    subprocess.run([tools.ffmpeg(), "-nostdin", "-v", "error", "-y", "-i", str(source), "-ac", "1", "-q:a", "4", str(target)],
                   check=True)


async def _import(path: Path, filename: str) -> tuple[dict[str, object], bool]:
    with path.open("rb") as handle:
        return await importer.import_upload(UploadFile(file=handle, filename=filename))


def _meetings_category() -> str:
    """Every AMI sample is a meeting, so it is filed under Meetings for the home page groups."""
    for category in library.categories():
        if str(category["name"]).casefold() == "meetings":
            return str(category["id"])
    return str(library.create_category("Meetings")["id"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache", type=Path, default=storage.data_dir() / "sample-downloads",
                        help="folder for downloaded recordings (kept so a rerun skips the download)")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    ready = processing.capabilities()["features"]
    added = 0
    with tempfile.TemporaryDirectory() as folder:
        for meeting, title, digest in SAMPLES:
            mp3 = Path(folder) / f"{meeting}.mp3"
            _to_mp3(_download(meeting, digest, args.cache), mp3)
            record, duplicate = asyncio.run(_import(mp3, f"{meeting}.mp3"))
            conversation_id = str(record["id"])
            if duplicate:
                print(f"{title} is already in Stellis.")
                continue
            storage.rename_conversation(conversation_id, f"{title} (AMI {meeting})")
            notes.save("conversation", conversation_id, CREDIT.format(id=meeting), 0)
            library.set_category(conversation_id, _meetings_category(), True)
            if ready["transcribe"] and ready["diarize"]:
                processing.request_processing(conversation_id)
            added += 1
            print(f"Added {title}.")
    if added and not (ready["transcribe"] and ready["diarize"]):
        print("Start Stellis with `uv run stellis`; the samples transcribe once the speech models finish downloading.")
    elif added:
        print("Open Stellis to watch the samples transcribe; each card shows its progress.")


if __name__ == "__main__":
    sys.exit(main())
