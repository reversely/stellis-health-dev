"""Builds Denver Lang's records from outside the hospital.

The source, scripts/sample_patients/denver-outside.txt, holds his dietitian,
physiotherapy and personal training records, device exports and his own notes
from 2024 to 2026. Clinical notes follow the plain-text style of
MIMIC-IV-Note. This script renders each document as a fixed-width PDF, or as a
PNG photo when its format is "photo", into the same folder as his Synthea
records, and writes its own manifest.

Usage:
    uv run --with reportlab python scripts/make_narrative_records.py
"""

from __future__ import annotations

import dataclasses
import json
import pathlib
import textwrap

from reportlab.lib import pagesizes
from reportlab.lib import styles
from reportlab import platypus

import sample_rendering

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE_FILE = ROOT / "sample_patients/denver-outside.txt"
OUT = ROOT.parent / "src/stellis/sample_records"
MANIFEST = "manifest-personal.json"
SOURCE = ("Synthetic record of Denver Lang written for Stellis Health. "
          "Not a real person.")
LINE_WIDTH = 78
FORMATS = ("pdf", "photo")


@dataclasses.dataclass(frozen=True)
class Note:
    """One document of the narrative."""
    file: str
    title: str
    date: str
    format: str
    text: str


def parse_notes(source: str) -> list[Note]:
    """Splits the narrative source into notes.

    Args:
        source: The source file's text. Lines before the first "=== file:"
            line are comments.

    Returns:
        The notes in source order.

    Raises:
        ValueError: A note lacks a header field or names an unknown format.
    """
    notes = []
    for block in source.split("=== file: ")[1:]:
        head, _, text = block.partition("\n---\n")
        lines = head.splitlines()
        fields = dict(line.split(": ", 1) for line in lines[1:])
        missing = {"title", "date", "format"} - fields.keys()
        if missing or fields["format"] not in FORMATS:
            raise ValueError(f"Check the header of {lines[0]}")
        notes.append(
            Note(lines[0].strip(), fields["title"], fields["date"],
                 fields["format"], text.strip("\n")))
    return notes


def wrap(text: str) -> list[str]:
    """Wraps lines longer than LINE_WIDTH, keeping their indentation."""
    lines = []
    for line in text.splitlines():
        indent = line[:len(line) - len(line.lstrip())]
        lines += textwrap.wrap(
            line, LINE_WIDTH, subsequent_indent=indent,
            drop_whitespace=False) or [""]
    return [line.rstrip() for line in lines]


def write_pdf(path: pathlib.Path, note: Note) -> None:
    """Renders a note as a fixed-width printout PDF."""
    body = styles.ParagraphStyle("note",
                                 fontName="Courier",
                                 fontSize=9,
                                 leading=11.5)
    footer = styles.ParagraphStyle("footer",
                                   fontName="Helvetica-Oblique",
                                   fontSize=8)
    story = [
        platypus.Preformatted("\n".join(wrap(note.text)), body),
        platypus.Spacer(0, 14),
        platypus.Paragraph(SOURCE, footer),
    ]
    document = platypus.SimpleDocTemplate(str(path),
                                          pagesize=pagesizes.LETTER,
                                          title=note.title,
                                          author="Stellis Health sample",
                                          invariant=True)
    document.build(story)


def main() -> None:
    """Writes the sample files and their manifest."""
    notes = parse_notes(SOURCE_FILE.read_text())
    OUT.mkdir(exist_ok=True)
    sample_rendering.replace_outputs(OUT, MANIFEST)
    for note in notes:
        if note.format == "photo":
            lines = wrap(note.text) + [""] + textwrap.wrap(SOURCE, 70)
            sample_rendering.write_photo(OUT / note.file, lines)
        else:
            write_pdf(OUT / note.file, note)
    manifest = {
        "patient":
            "Denver Lang",
        "source":
            SOURCE,
        "records": [{
            "file": note.file,
            "title": note.title,
            "record_date": note.date,
        } for note in notes],
    }
    (OUT / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {len(notes)} records to {OUT}")


if __name__ == "__main__":
    main()
