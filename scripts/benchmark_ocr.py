"""Benchmark local OCR against synthetic page text and sample photos."""

from __future__ import annotations

import io
import json
import os
import pathlib
import re
import statistics
import tempfile
import time

from stellis import document_ocr, documents, sample_records

TEXT = ('SYNTHETIC OCR BENCHMARK\nMedication: Metformin 500 mg\n'
        'Weight: 80.5 kg\nPulse: 72 bpm\nDate: 2026-04-02')


def word_error(reference, actual):
    """Returns word edit distance divided by reference word count."""
    words = lambda value: re.findall(r'\w+(?:\.\d+)?', value.casefold())
    expected, observed = words(reference), words(actual)
    row = list(range(len(observed) + 1))
    for index, word in enumerate(expected, 1):
        next_row = [index]
        for offset, other in enumerate(observed, 1):
            next_row.append(min(next_row[-1] + 1, row[offset] + 1,
                                row[offset - 1] + (word != other)))
        row = next_row
    return round(row[-1] / len(expected), 4)


def fixtures():
    """Builds printed image, scanned PDF and mixed PDF inputs."""
    import pymupdf
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new('RGB', (1500, 900), 'white')
    font = ImageFont.truetype(os.environ.get('STELLIS_BENCH_FONT', 'DejaVuSans.ttf'), 36)
    ImageDraw.Draw(image).multiline_text((80, 80), TEXT, font=font,
                                        fill='black', spacing=20)
    buffer = io.BytesIO()
    image.save(buffer, 'PNG')
    png = buffer.getvalue()
    with pymupdf.open() as scanned:
        scanned.new_page(width=750, height=450).insert_image(
            pymupdf.Rect(0, 0, 750, 450), stream=png)
        pdf = scanned.tobytes()
    with pymupdf.open() as mixed:
        mixed.new_page().insert_text((50, 50), 'Embedded text remains unchanged')
        mixed.new_page(width=750, height=450).insert_image(
            pymupdf.Rect(0, 0, 750, 450), stream=png)
        mixed_pdf = mixed.tobytes()
    cases = [('printed.png', png, 1, TEXT), ('scanned.pdf', pdf, 1, TEXT),
             ('mixed.pdf', mixed_pdf, 2, TEXT)]
    root = pathlib.Path(__file__).resolve().parent
    narrative = (root / 'sample_patients/denver-outside.txt').read_text()
    footer = 'Synthetic record of Denver Lang written for Stellis Health. Not a real person.'
    for block in narrative.split('=== file: ')[1:]:
        head, _, text = block.partition('\n---\n')
        name = head.splitlines()[0]
        if 'format: photo' in head:
            cases.append((name, (sample_records.FOLDER / name).read_bytes(), 1,
                          text.strip() + '\n' + footer))
    name = '2025-03-23-lab-results-photo.png'
    cases.append((name, (sample_records.FOLDER / name).read_bytes(), 1, None))
    return cases


def main():
    """Prints timing and accuracy aggregates without recognized health text."""
    output = []
    with tempfile.TemporaryDirectory(prefix='stellis-ocr-benchmark-') as directory:
        os.environ['STELLIS_DATA_DIR'] = directory
        for name, content, number, reference in fixtures():
            record, _ = documents.create(name, content)
            elapsed = []
            errors = []
            for _ in range(3):
                start = time.monotonic()
                result = document_ocr.read_page(record['id'], number)
                elapsed.append(round((time.monotonic() - start) * 1000))
                text = documents.get_page(result, number)['text']
                if reference is not None:
                    errors.append(word_error(reference, text))
            output.append({'fixture': name, 'runs': len(elapsed),
                           'median_ms': statistics.median(elapsed),
                           'max_ms': max(elapsed), 'word_error_rate':
                               max(errors) if errors else None})
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
