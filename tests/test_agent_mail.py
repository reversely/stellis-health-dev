"""Project mail search stays scoped and yields trusted Gmail links."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from stellis import agent_mail, agents, notebooks


class AgentMailTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_filtered_search_broadens_once(self):
        book = notebooks.create("Water Treatment")
        agent = agents.create("Mira", "Coordinator", notebook_id=book["id"])
        message = {"id": "message1", "subject": "WT-04 RFI 91", "sender": "manager@buildco.example",
                   "toRecipients": ["me@epcm.example"], "ccRecipients": [], "date": "2026-10-10",
                   "labelIds": ["INBOX", "Label_WaterTreatment"], "plaintextBody": "Review is open."}
        agents.remember_email_convention(agent["id"], book["id"], message)
        empty = {"threads": [], "resultCountEstimate": "0"}
        found = {"threads": [{"id": "thread1"}], "resultCountEstimate": "1"}
        with patch.object(agent_mail.calendar, "connections", return_value=[
                {"provider": "google", "mail_connected": True}]), \
             patch.object(agent_mail.gmail_api, "search_threads", new_callable=AsyncMock,
                          side_effect=[empty, found]) as search, \
             patch.object(agent_mail.gmail_api, "get_thread", new_callable=AsyncMock,
                          return_value={"id": "thread1", "messages": [message]}):
            result = asyncio.run(agent_mail.sources(agent, "Why is RFI 91 open?", book["id"],
                                                     agents.memories(agent["id"])))
        self.assertEqual(search.await_count, 2)
        self.assertIn("label:Label_WaterTreatment", search.await_args_list[0].args[0])
        self.assertIn('subject:"RFI 91"', search.await_args_list[0].args[0])
        self.assertEqual(search.await_args_list[1].args[0], 'subject:"RFI 91"')
        self.assertEqual(result[0]["source_id"], "mail:message1")
        self.assertEqual(result[0]["target"], "https://mail.google.com/mail/u/0/#all/thread1")
        self.assertIn("WT-04 RFI", agents.memories(agent["id"])[0]["fact"])

    def test_first_matching_mail_is_remembered(self):
        book = notebooks.create("Water Treatment")
        agent = agents.create("Mira", "Coordinator", notebook_id=book["id"])
        message = {"id": "one", "subject": "WT-04 RFI 91", "sender": "manager@buildco.example",
                   "toRecipients": ["me@epcm.example"], "ccRecipients": [], "date": "2026-10-10",
                   "labelIds": ["INBOX", "Label_WaterTreatment"], "plaintextBody": "Review is open."}
        with patch.object(agent_mail.calendar, "connections", return_value=[
                {"provider": "google", "mail_connected": True}]), \
             patch.object(agent_mail.gmail_api, "search_threads", new_callable=AsyncMock,
                          return_value={"threads": [{"id": "thread1"}], "resultCountEstimate": "1"}), \
             patch.object(agent_mail.gmail_api, "get_thread", new_callable=AsyncMock,
                          return_value={"id": "thread1", "messages": [message]}):
            asyncio.run(agent_mail.sources(agent, "Why is RFI 91 open?", book["id"], []))
        self.assertEqual(agents.memories(agent["id"])[0]["source_id"], "mail:one")

    def test_unrelated_question_does_not_search_mail(self):
        book = notebooks.create("Water Treatment")
        agent = agents.create("Mira", "Coordinator", notebook_id=book["id"])
        with patch.object(agent_mail.gmail_api, "search_threads", new_callable=AsyncMock) as search:
            self.assertEqual(asyncio.run(agent_mail.sources(agent, "What is the pump target?", book["id"], [])), [])
            search.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
