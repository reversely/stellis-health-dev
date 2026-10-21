"""Tests for the cited health summary built from all documents."""

import json
import os
import tempfile
import unittest
from unittest import mock

from fastapi import testclient

from stellis import agent_gateway
from stellis import health_summary
from stellis import sample_records
from stellis import server

REPLY = ("## Overview\nDenver lost weight with a dietitian. [[source:1]]\n\n"
         "## Medications\nHydrochlorothiazide was stopped. [[source:2]]")


class HealthSummaryTest(unittest.TestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ,
                                      {"STELLIS_DATA_DIR": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)
        self.client = testclient.TestClient(server.app)
        self.addCleanup(self.client.close)

    def refresh(self, reply: str = REPLY):
        turn = mock.AsyncMock(return_value=(reply, "session"))
        with mock.patch.object(agent_gateway, "turn", turn):
            response = self.client.post("/api/v1/summary/refresh")
        return response, turn

    def test_no_documents_is_a_400(self):
        response, turn = self.refresh()

        self.assertEqual(response.status_code, 400)
        turn.assert_not_awaited()
        self.assertIsNone(self.client.get("/api/v1/summary").json()["summary"])

    def test_summary_reads_recent_and_relevant_pages_and_is_stored(self):
        sample_records.load()

        response, turn = self.refresh()

        self.assertEqual(response.status_code, 200, response.text)
        context = json.loads(turn.await_args.args[0].split("\n\n", 1)[1])
        titles = [source["title"] for source in context["sources"]]
        self.assertLessEqual(len(titles), health_summary.MAX_PASSAGES)
        self.assertIn("Lab results 2026-04-02", titles)
        self.assertTrue(any("Telephone encounter" in title for title in titles))
        self.assertTrue(all(source["date"] for source in context["sources"]))
        stored = self.client.get("/api/v1/summary").json()["summary"]
        self.assertEqual(
            stored["content"],
            REPLY.replace("[[source:1]]",
                          "[[1]]").replace("[[source:2]]", "[[2]]"))
        self.assertEqual([item["n"] for item in stored["citations"]], [1, 2])
        self.assertEqual(stored["document_count"], 47)

    def test_bad_citations_store_nothing(self):
        sample_records.load()

        response, _ = self.refresh("## Overview\nInvented. [[source:999]]")

        self.assertEqual(response.status_code, 503)
        self.assertIsNone(self.client.get("/api/v1/summary").json()["summary"])


if __name__ == "__main__":
    unittest.main()
