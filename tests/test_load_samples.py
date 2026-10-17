"""The sample loader files AMI meetings under Meetings and pins each download (#224)."""

from __future__ import annotations

import importlib.util
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from stellis import library

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "load_samples.py"


def load_script():
    spec = importlib.util.spec_from_file_location("load_samples", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LoadSamplesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.script = load_script()

    def tearDown(self) -> None:
        self.env.stop()
        self.temp.cleanup()

    def test_every_sample_has_a_pinned_sha256_and_a_title(self) -> None:
        self.assertEqual(len(self.script.SAMPLES), 3)
        for meeting, title, digest in self.script.SAMPLES:
            self.assertRegex(meeting, r"^[A-Z]{2}\d{4}[a-d]$")
            self.assertTrue(title)
            self.assertTrue(re.fullmatch(r"[0-9a-f]{64}", digest))

    def test_samples_go_under_meetings_even_after_it_was_deleted(self) -> None:
        seeded = {item["name"]: item["id"] for item in library.categories()}
        self.assertEqual(self.script._meetings_category(), seeded["Meetings"])
        library.delete_category(seeded["Meetings"])
        created = self.script._meetings_category()
        self.assertEqual(next(item["name"] for item in library.categories() if item["id"] == created), "Meetings")

    def test_a_download_that_fails_its_checksum_is_removed(self) -> None:
        cache = Path(self.temp.name, "cache"); cache.mkdir()
        (cache / "ES2002a.Mix-Headset.wav").write_bytes(b"not the meeting")
        with self.assertRaises(SystemExit):
            self.script._download("ES2002a", "0" * 64, cache)
        self.assertFalse((cache / "ES2002a.Mix-Headset.wav").exists())


if __name__ == "__main__":
    unittest.main()
