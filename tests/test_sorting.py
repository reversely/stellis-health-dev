"""Tests for proposing notebooks for unsorted records and applying them."""

import json
import os
import tempfile
import unittest
from unittest import mock

from fastapi import testclient

from stellis import agent_gateway
from stellis import documents
from stellis import notebook_sources
from stellis import notebooks
from stellis import sample_records
from stellis import server
from stellis import sorting


def _item(index: int) -> sorting.Item:
    return sorting.Item("document", f"d{index}", f"Record {index}",
                        "2024-01-01")


class ParseGroupsTest(unittest.TestCase):

    def test_maps_names_drops_bad_indexes_and_repeats(self):
        items = [_item(index) for index in range(1, 5)]
        reply = json.dumps({
            "groups": [
                {
                    "notebook": "  Nutrition ",
                    "reason": "Dietitian visits",
                    "items": [1, 2, 9, "3"]
                },
                {
                    "notebook": "Heart care",
                    "items": [2, 3]
                },
                {
                    "notebook": "Empty",
                    "items": [9]
                },
                {
                    "notebook": "",
                    "items": [4]
                },
                "not a group",
            ]
        })

        groups = sorting.parse_groups(reply, items, {"heart care": "nb-1"})

        self.assertEqual([(group["notebook_name"], group["notebook_id"],
                           [item["id"]
                            for item in group["items"]])
                          for group in groups],
                         [("Nutrition", None, ["d1", "d2"]),
                          ("Heart care", "nb-1", ["d3"])])
        self.assertEqual(groups[0]["reason"], "Dietitian visits")

    def test_unreadable_reply_is_an_error(self):
        for reply in ("no", "[]", '{"groups": {}}'):
            with self.subTest(reply=reply):
                with self.assertRaises(sorting.SortingError):
                    sorting.parse_groups(reply, [_item(1)], {})


class SortingApiTest(unittest.TestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ,
                                      {"STELLIS_DATA_DIR": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)
        sample_records.load()
        self.client = testclient.TestClient(server.app)
        self.addCleanup(self.client.close)

    def unsorted(self) -> list[dict[str, str]]:
        return self.client.get("/api/v1/records/unsorted").json()["items"]

    def test_suggest_sends_titles_and_opening_text(self):
        reply = json.dumps(
            {"groups": [{
                "notebook": "Nutrition",
                "items": [1, 2]
            }]})
        turn = mock.AsyncMock(return_value=(reply, "session"))

        with mock.patch.object(agent_gateway, "turn", turn):
            response = self.client.post("/api/v1/records/sort/suggest")

        body = response.json()
        prompt = turn.await_args.args[0]
        context = json.loads(prompt.split("\n\n", 1)[1])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(context["records"]), 50)
        self.assertEqual(context["records"][0]["date"], "1997-12-04")
        self.assertIn("Hospital admission", context["records"][0]["title"])
        self.assertLessEqual(
            max(len(record["opening_text"]) for record in context["records"]),
            sorting.EXCERPT_CHARS)
        self.assertEqual(len(body["groups"][0]["items"]), 2)
        self.assertEqual(len(body["unsorted"]), 48)

    def test_apply_creates_the_notebook_and_moves_the_group(self):
        dietitian = [
            item for item in self.unsorted() if "Dietitian" in item["title"]
        ]

        response = self.client.post("/api/v1/records/sort/apply",
                                    json={
                                        "notebook_name": "Nutrition",
                                        "items": dietitian
                                    })

        body = response.json()
        self.assertEqual((body["moved"], body["failed"]), (len(dietitian), []))
        self.assertEqual(len(documents.list_all(body["notebook_id"])),
                         len(dietitian))
        self.assertEqual(len(self.unsorted()), 50 - len(dietitian))
        again = self.client.post("/api/v1/records/sort/apply",
                                 json={
                                     "notebook_name": "nutrition",
                                     "items": []
                                 }).json()
        self.assertEqual(again["notebook_id"], body["notebook_id"])

    def test_full_notebook_reports_the_records_it_could_not_take(self):
        items = self.unsorted()[:4]

        with mock.patch.object(notebook_sources, "LIMIT", 3):
            body = self.client.post("/api/v1/records/sort/apply",
                                    json={
                                        "notebook_name": "Heart care",
                                        "items": items
                                    }).json()

        self.assertEqual(body["moved"], 3)
        self.assertEqual(body["failed"][0]["error"],
                         "This notebook is full at 3 sources")

    def test_move_one_record_and_back(self):
        book = notebooks.create("Dental")["id"]
        dental = next(
            item for item in self.unsorted() if "Dental" in item["title"])

        moved = self.client.put(
            f"/api/v1/records/document/{dental['id']}/notebook",
            json={"notebook_id": book})
        back = self.client.put(
            f"/api/v1/records/document/{dental['id']}/notebook",
            json={"notebook_id": None})
        unknown = self.client.put("/api/v1/records/surgery/x/notebook",
                                  json={"notebook_id": book})

        self.assertEqual((moved.status_code, back.status_code), (200, 200))
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(len(self.unsorted()), 50)

    def test_model_failure_is_a_503(self):
        failing = mock.AsyncMock(
            side_effect=agent_gateway.GatewayError("Allowance used"))
        with mock.patch.object(agent_gateway, "turn", failing):
            response = self.client.post("/api/v1/records/sort/suggest")

        self.assertEqual((response.status_code, response.json()["detail"]),
                         (503, "Allowance used"))


if __name__ == "__main__":
    unittest.main()
