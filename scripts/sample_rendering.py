"""Shared rendering for the sample record builders.

Both builders write PDFs whose bytes do not change between runs, and grey PNG
"photos" of paper printouts that carry no text layer.
"""

from __future__ import annotations

import json
import pathlib

from PIL import Image
from PIL import ImageDraw
from PIL import ImageFont

PHOTO_WIDTH = 1100
MANIFEST_PREFIX = "manifest-"
_LINE_HEIGHT = 34
_MARGIN = 60


def write_photo(path: pathlib.Path, lines: list[str]) -> None:
    """Draws text lines as a grey photo of a printout, with no text layer.

    Args:
        path: Where to save the PNG.
        lines: The lines to draw, already wrapped to fit the width.
    """
    font = ImageFont.load_default(size=22)
    height = 2 * 40 + _LINE_HEIGHT * len(lines)
    image = Image.new("L", (PHOTO_WIDTH, height), 246)
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(lines):
        draw.text((_MARGIN, 40 + _LINE_HEIGHT * index),
                  line,
                  fill=35,
                  font=font)
    image.save(path, optimize=True)


def replace_outputs(folder: pathlib.Path, manifest_name: str) -> None:
    """Deletes the files an earlier run of one builder wrote.

    Each builder lists its files in its own manifest, so two builders can
    share a folder without deleting each other's files.

    Args:
        folder: The sample records folder.
        manifest_name: The builder's manifest file name.
    """
    manifest = folder / manifest_name
    if not manifest.exists():
        return
    for record in json.loads(manifest.read_text())["records"]:
        (folder / record["file"]).unlink(missing_ok=True)
