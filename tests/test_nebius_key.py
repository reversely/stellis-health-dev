"""The user's Nebius API key is entered in the app and stays on the device (#223)."""

from __future__ import annotations

import os
import stat
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import ai
from stellis.server import app

KEY = "nb-test-key-0123456789abcdef"


class NebiusKeyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name}, clear=False)
        self.env.start()
        os.environ.pop("NEBIUS_API_KEY", None)
        self.no_dotenv = patch.object(ai.Path, "is_file", return_value=False)
        self.no_dotenv.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.no_dotenv.stop()
        self.env.stop()
        self.temp.cleanup()

    def test_save_replace_and_remove_without_ever_returning_the_key(self) -> None:
        self.assertEqual(self.client.get("/api/v1/settings/nebius-key").json(), {"configured": False, "source": None})
        saved = self.client.put("/api/v1/settings/nebius-key", json={"key": f"  {KEY}  "})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json(), {"configured": True, "source": "saved"})
        self.assertNotIn(KEY, saved.text)
        self.assertNotIn(KEY, self.client.get("/api/v1/settings/nebius-key").text)
        self.assertEqual(ai._key(), KEY)
        mode = stat.S_IMODE(os.stat(ai._key_file()).st_mode)
        self.assertEqual(mode, 0o600)
        self.client.put("/api/v1/settings/nebius-key", json={"key": KEY + "x"})
        self.assertEqual(ai._key(), KEY + "x")
        self.assertEqual(self.client.delete("/api/v1/settings/nebius-key").json(), {"configured": False, "source": None})
        self.assertIsNone(ai._key())

    def test_saved_key_wins_over_the_environment_and_removal_falls_back(self) -> None:
        with patch.dict(os.environ, {"NEBIUS_API_KEY": "env-key-abcdefghijklmnop"}):
            self.assertEqual(self.client.get("/api/v1/settings/nebius-key").json()["source"], "environment")
            self.client.put("/api/v1/settings/nebius-key", json={"key": KEY})
            self.assertEqual(ai._key(), KEY)
            self.client.delete("/api/v1/settings/nebius-key")
            self.assertEqual(ai._key(), "env-key-abcdefghijklmnop")

    def test_malformed_keys_are_rejected(self) -> None:
        for value in ("short", "has a space in the middle of it", "x" * 600):
            response = self.client.put("/api/v1/settings/nebius-key", json={"key": value})
            self.assertIn(response.status_code, (400, 422), value)
        self.assertFalse(ai._key_file().exists())


if __name__ == "__main__":
    unittest.main()
