"""Verify the deployed OCR pipeline with isolated image and scanned PDF records."""

import os
import tempfile

import pymupdf

from stellis import document_ocr, documents, sample_records


def main():
    """Fail when the image cannot recognize printed text through the app worker."""
    with tempfile.TemporaryDirectory(prefix="stellis-ocr-check-") as directory:
        os.environ["STELLIS_DATA_DIR"] = directory
        with pymupdf.open() as original:
            page = original.new_page()
            page.insert_text((50, 80), "Medication: Metformin 500 mg", fontsize=18)
            image = page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).tobytes("png")
        with pymupdf.open() as scanned:
            scanned.new_page().insert_image(pymupdf.Rect(0, 0, 595, 842), stream=image)
            pdf = scanned.tobytes()
        fixtures = [
            ("scan.pdf", pdf, ("Metformin 500 mg",)),
            ("lab.png", (sample_records.FOLDER / "2025-03-23-lab-results-photo.png").read_bytes(),
             ("67.8 mg/dL", "2.5 mg/dL")),
        ]
        for filename, content, expected in fixtures:
            record, _ = documents.create(filename, content)
            result = document_ocr.read_page(record["id"], 1)
            page = result["pages"][0]
            if page["text_source"] != "ocr" or any(text not in page["text"] for text in expected):
                raise RuntimeError(f"OCR verification failed for {filename}")
    print("OCR verification passed for scanned PDF and lab photo")


if __name__ == "__main__":
    main()
