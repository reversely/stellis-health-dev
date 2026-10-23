"""Offline term search and bounded authenticated API responses."""
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from stellis import intake_library, server


class LibraryTest(unittest.TestCase):
    def test_goal_categories_prepare_several_answers(self):
        items = intake_library.search("goals", "")["items"]
        self.assertIn("Pregnancy", [item["label"] for item in items])
        self.assertIn("Sleep", [item["label"] for item in items])

    def test_generic_and_brand_names_have_real_reference_ids(self):
        for query in ("metformin", "Tylenol", "folic acid"):
            with self.subTest(query=query):
                result = intake_library.search("medicines", query)
                self.assertGreater(result["total"], 0)
                self.assertLessEqual(len(result["items"]), 20)
                for item in result["items"]:
                    self.assertTrue(item["id"].isdigit())
                    self.assertNotIn("I take", item["answer"])
                    self.assertIn("discuss", item["answer"])

    def test_search_does_not_recommend_medicines_before_a_query(self):
        self.assertEqual(intake_library.search("medicines", "")["items"], [])
        self.assertEqual(intake_library.search("medicines", "<img src=x>")["items"], [])

    def test_api_is_authenticated_and_bounds_input(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "STELLIS_DATA_DIR": directory, "STELLIS_AUTH_DB_DIR": directory,
            "STELLIS_AUTH_MODE": "required"}):
            client = TestClient(server.app)
            self.assertEqual(client.get("/api/v1/intake/library").status_code, 401)
        with patch.dict(os.environ, {"STELLIS_AUTH_MODE": "off"}):
            client = TestClient(server.app)
            self.assertEqual(client.get("/api/v1/intake/library", params={"q": "a" * 101}).status_code, 422)
            self.assertEqual(client.get("/api/v1/intake/library", params={"category": "invented"}).status_code, 422)
