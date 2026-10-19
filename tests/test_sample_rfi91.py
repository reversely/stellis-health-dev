"""Fictional RFI 91 sample, mailbox shapes, and answer-key traceability."""

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import agents, fixture_mailbox, notebooks, pages, sample_rfi91, source_search, storage
from stellis.server import app


class RFI91SampleTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name, "STELLIS_AUTH_MODE": "off"})
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_seed_and_reset_keep_other_data(self):
        own_book = notebooks.create("My real project")
        own_page = pages.create("My document", str(own_book["id"]), "Unrelated user data")
        result = self.client.post("/api/v1/samples/rfi91")
        self.assertEqual(result.status_code, 200, result.text)
        case = result.json()
        self.assertTrue(case["installed"])
        mail_sources = fixture_mailbox.rfi91_sources(case["projects"][0]["notebook_id"], "Why is RFI 91 open?")
        self.assertEqual({source["source_id"] for source in mail_sources},
                         {"mail:sample-rfi91-open", "mail:sample-rfi91-block", "mail:sample-rfi91-deadline"})
        self.assertEqual(fixture_mailbox.rfi91_sources(case["projects"][1]["notebook_id"], "RFI 91"), [])
        self.assertEqual(self.client.get(mail_sources[0]["target"]).json()["id"], "sample-rfi91-open")
        self.assertEqual(len(case["projects"]), 4)
        self.assertEqual(len({project["agent_name"] for project in case["projects"]}), 4)
        for project in case["projects"]:
            self.assertEqual(agents.resolved_agent(project["notebook_id"])["agent"]["id"], project["agent_id"])
        self.assertEqual(agents.memories(case["projects"][0]["agent_id"])[0]["kind"], "email_convention")
        self.assertEqual(self.client.post("/api/v1/samples/rfi91").json()["conversation_id"], case["conversation_id"])
        conversation_id = case["conversation_id"]
        self.assertEqual(storage.get_conversation(conversation_id)["notebook_id"], case["projects"][0]["notebook_id"])
        self.assertEqual(len(storage.get_display_transcript(conversation_id)["segments"]), 5)
        self.assertEqual(self.client.get(f"/api/v1/conversations/{conversation_id}/audio").status_code, 200)
        results = source_search.search_sources("certificate", case["projects"][0]["notebook_id"])
        self.assertTrue(any(row["source_type"] == "passage" for row in results))
        self.assertTrue(any(row["source_type"] == "page" for row in results))
        reset = self.client.put("/api/v1/samples/rfi91/reset")
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertNotEqual(reset.json()["conversation_id"], conversation_id)
        self.assertNotEqual(reset.json()["projects"][0]["agent_id"], case["projects"][0]["agent_id"])
        self.assertIsNone(storage.get_conversation(conversation_id, include_trashed=True))
        self.assertEqual(len(storage.list_conversations()), 1)
        self.assertEqual(len(agents.list_agents()), 5)  # General and four sample agents
        self.assertIn(str(own_book["id"]), {str(book["id"]) for book in notebooks.list_notebooks()})
        self.assertEqual(pages.get(str(own_page["id"]))["title"], "My document")

    def test_every_answer_has_existing_fixture_sources(self):
        page_keys = {"page:spec", "page:status"}
        conversation_keys = {f"passage:rfi91-{index}" for index in range(1, 6)} | {"note:meeting"}
        mail_ids = {f"mail:{message['id']}" for thread in sample_rfi91.MAIL_THREADS for message in thread["messages"]}
        known = page_keys | conversation_keys | mail_ids
        self.assertEqual(len(sample_rfi91.ANSWER_KEY), 5)
        for fact in sample_rfi91.ANSWER_KEY:
            self.assertTrue(fact["fact"])
            self.assertTrue(set(fact["sources"]) <= known)
        for text in (sample_rfi91.SPEC, sample_rfi91.STATUS, sample_rfi91.MEETING_NOTES):
            self.assertIn("Sample", text)
        self.assertGreater(sample_rfi91._fixture_path("rfi91_meeting.mp3").stat().st_size, 100_000)

    def test_mailbox_search_get_and_draft_without_send(self):
        mailbox = fixture_mailbox.FixtureMailbox()
        found = mailbox.search_threads('label:Label_WaterTreatment subject:RFI after:2026/09/27')
        self.assertEqual(found["resultCountEstimate"], "1")
        self.assertEqual(found["threads"][0]["id"], "sample-rfi91-thread")
        self.assertNotIn("plaintextBody", found["threads"][0]["messages"][0])
        thread = mailbox.get_thread("sample-rfi91-thread")
        self.assertIn("plaintextBody", thread["messages"][0])
        self.assertEqual(mailbox.search_threads('in:sent from:consultant@epcm.example')["resultCountEstimate"], "1")
        draft = mailbox.create_draft(["manager@buildco.example"], "Re: RFI 91", "Engineering is reviewing the package.",
                                     replyToMessageId="sample-rfi91-open")
        self.assertEqual(mailbox.drafts[0]["id"], draft["id"])
        mailbox.reset()
        self.assertEqual(mailbox.drafts, [])


if __name__ == "__main__":
    unittest.main()
