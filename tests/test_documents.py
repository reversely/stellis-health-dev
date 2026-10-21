"""Uploaded documents: text per page, scans that need text, search, and the file served back."""
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from stellis import documents, notebooks, sample_records, search, source_search
from stellis.server import app

SAMPLES = Path(sample_records.__file__).parent


class DocumentsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.book = notebooks.create("Kidney")["id"]
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def upload(self, name: str, content: bytes, notebook_id: str | None = None):
        data = {"notebook_id": notebook_id} if notebook_id else {}
        return self.client.post("/api/v1/documents", files={"file": (name, content)}, data=data)

    def test_a_digital_pdf_keeps_its_text_per_page_and_is_searchable(self):
        content = (SAMPLES / "kidney-pathology-report.pdf").read_bytes()
        response = self.upload("kidney-pathology-report.pdf", content, self.book)
        self.assertEqual(response.status_code, 200, response.text)
        record = response.json()["document"]
        self.assertEqual((record["status"], record["page_count"], record["notebook_id"]), ("ready", 2, self.book))
        self.assertIn("Renal cell carcinoma", record["pages"][0]["text"])
        self.assertIn("\n", record["pages"][0]["text"])
        hits = [item for item in search.search_library("clear cell")["results"] if item["kind"] == "document"]
        self.assertEqual((hits[0]["document_id"], hits[0]["page"]), (record["id"], 1))
        sources = source_search.search_sources("nephrectomy", self.book)
        self.assertEqual(sources[0]["target"], f"/document/{record['id']}?page=1")
        served = self.client.get(f"/api/v1/documents/{record['id']}/file")
        self.assertEqual((served.status_code, served.headers["content-type"], served.content),
                         (200, "application/pdf", content))
        self.assertEqual(self.upload("again.pdf", content).json()["duplicate"], True)

    def test_scans_and_images_need_text(self):
        scan = self.upload("thyroid-scan.pdf", (SAMPLES / "thyroid-pathology-report-scan.pdf").read_bytes()).json()["document"]
        self.assertEqual((scan["status"], scan["pages"][0]["text"]), ("needs_text", ""))
        buffer = io.BytesIO()
        Image.new("RGB", (40, 30), "white").save(buffer, "PNG")
        image = self.upload("Lab photo.png", buffer.getvalue()).json()["document"]
        self.assertEqual((image["status"], image["page_count"], image["title"], image["media_type"]),
                         ("needs_text", 1, "Lab photo", "image/png"))

    def test_rejects_other_files_and_spoofed_types(self):
        cases = [("notes.txt", b"hello", "Choose a PDF, PNG or JPEG file"), ("empty.pdf", b"", "The file is empty"),
                 ("fake.pdf", b"<html>", "This file is not a PDF file"), ("broken.pdf", b"%PDF-1.4 nonsense", "This PDF could not be read"),
                 ("fake.png", b"\x89PNG\r\n\x1a\nbroken", "This image could not be read")]
        for name, content, message in cases:
            with self.subTest(name=name):
                response = self.upload(name, content)
                self.assertEqual((response.status_code, response.json()["detail"]), (400, message))
        with patch.object(documents, "MAX_BYTES", 10):
            self.assertEqual(self.upload("big.pdf", b"%PDF-" + b"0" * 20).json()["detail"], "Upload a document of at most 20 MB")
        self.assertEqual(self.upload("a.pdf", (SAMPLES / "lung-pathology-report.pdf").read_bytes(), "missing").status_code, 404)

    def test_rename_move_and_delete(self):
        record = self.upload("lung.pdf", (SAMPLES / "lung-pathology-report.pdf").read_bytes()).json()["document"]
        moved = self.client.patch(f"/api/v1/documents/{record['id']}", json={"title": "Lung report", "notebook_id": self.book, "move": True}).json()
        self.assertEqual((moved["title"], moved["notebook_id"]), ("Lung report", self.book))
        self.assertEqual([item["id"] for item in documents.list_for(self.book)], [record["id"]])
        path, _ = documents.file_path(record["id"])
        self.assertEqual(self.client.delete(f"/api/v1/documents/{record['id']}").status_code, 200)
        self.assertFalse(path.exists())
        self.assertEqual(self.client.get(f"/api/v1/documents/{record['id']}").status_code, 404)
        self.assertEqual(self.client.get(f"/document/{record['id']}").status_code, 200)

    def test_sample_records_load_once_into_one_notebook(self):
        first = sample_records.load()
        self.assertEqual((first["added"], first["total"]), (8, 8))
        self.assertEqual(sample_records.load()["added"], 0)
        filed = documents.list_for(str(first["notebook_id"]))
        self.assertEqual(len(filed), 8)
        self.assertEqual(sum(item["status"] == "needs_text" for item in filed), 2)
        self.assertIn("Breast pathology report", {item["title"] for item in filed})


if __name__ == "__main__":
    unittest.main()
