"""Build the sample pathology records in src/stellis/sample_records from TCGA-Reports.

TCGA-Reports (Kefeli et al., 2024, MIT License) publishes OCR text of de-identified
TCGA pathology reports: https://github.com/tatonetti-lab/tcga-path-reports. This
script picks one English report per cancer type and renders it as a digital PDF,
an image-only PDF that stands in for a scan, or a PNG photo.

Usage: uv run --with reportlab python scripts/make_sample_records.py TCGA_Reports.csv tcga_patient_to_cancer_type.csv
"""
from __future__ import annotations

import csv
import json
import re
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).resolve().parent.parent / "src/stellis/sample_records"
# Cancer type, organ for the title, and how the file is rendered.
CHOICES = [("BRCA", "Breast", "pdf"), ("LUAD", "Lung", "pdf"), ("KIRC", "Kidney", "pdf"), ("COAD", "Colon", "pdf"),
           ("PRAD", "Prostate", "pdf"), ("UCEC", "Uterus", "pdf"), ("THCA", "Thyroid", "scan"), ("SKCM", "Skin", "png")]
SOURCE = "Text from TCGA-Reports (Kefeli et al., 2024), MIT License. De-identified TCGA pathology report."


def _english(text: str) -> bool:
    return sum(character.isascii() for character in text) / len(text) > 0.995


def _paragraphs(text: str) -> list[str]:
    """Start a paragraph at each upper-case heading such as 'DIAGNOSIS:' so the page reads like a report."""
    parts = re.split(r"(?<=[.:])\s+(?=[A-Z][A-Z &/()-]{5,}[:.])", " ".join(text.split()))
    return [part.strip() for part in parts if part.strip()]


def _pdf(path: Path, title: str, patient: str, text: str) -> None:
    styles = getSampleStyleSheet()
    body = styles["BodyText"].clone("body", fontSize=11, leading=16)
    story = [Paragraph(title, styles["Title"]), Paragraph(f"Case {patient}", styles["Normal"]), Spacer(0, 12)]
    for paragraph in _paragraphs(text):
        story += [Paragraph(paragraph.replace("&", "&amp;").replace("<", "&lt;"), body), Spacer(0, 6)]
    story += [Spacer(0, 12), Paragraph(SOURCE, styles["Italic"])]
    SimpleDocTemplate(str(path), pagesize=LETTER, title=title, author="TCGA-Reports sample",
                      leftMargin=72, rightMargin=72, topMargin=72, bottomMargin=72).build(story)


def _image(title: str, patient: str, text: str) -> Image.Image:
    font, heading = ImageFont.load_default(size=22), ImageFont.load_default(size=30)
    lines = [title, f"Case {patient}", ""] + [line for paragraph in _paragraphs(text)
                                              for line in textwrap.wrap(paragraph, 92) + [""]] + [SOURCE]
    image = Image.new("L", (1275, 60 + 30 * len(lines)), 250)
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(lines):
        draw.text((72, 40 + 30 * index), line, fill=30, font=heading if index == 0 else font)
    return image


def main(reports_csv: str, types_csv: str) -> None:
    csv.field_size_limit(10**8)
    types = {row["patient_id"]: row["cancer_type"] for row in csv.DictReader(open(types_csv))}
    rows = list(csv.DictReader(open(reports_csv)))
    OUT.mkdir(exist_ok=True)
    manifest = []
    for code, organ, form in CHOICES:
        row = next(row for row in rows if types.get(row["patient_filename"].split(".")[0]) == code
                   and 1800 < len(row["text"]) < 4500 and "DIAGNOSIS" in row["text"].upper() and _english(row["text"]))
        patient = row["patient_filename"].split(".")[0]
        title = f"{organ} pathology report"
        stem = f"{organ.lower()}-pathology-report"
        if form == "pdf":
            filename = stem + ".pdf"
            _pdf(OUT / filename, title, patient, row["text"])
        elif form == "scan":
            filename = stem + "-scan.pdf"
            _image(title, patient, row["text"]).convert("RGB").save(OUT / filename, "PDF", resolution=150)
        else:
            filename = stem + ".png"
            _image(title, patient, row["text"]).save(OUT / filename, optimize=True)
        manifest.append({"file": filename, "title": title, "case": patient, "cancer_type": code,
                         "source_file": row["patient_filename"]})
    (OUT / "manifest.json").write_text(json.dumps({"source": SOURCE, "records": manifest}, indent=2) + "\n")
    print(f"Wrote {len(manifest)} records to {OUT}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
