"""Sent mail cleaning, grouping, exclusions, and reviewable draft evidence."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from stellis import agents, mail_style
from stellis.server import app


class MailStyleTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name, "STELLIS_AUTH_MODE": "off"})
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def _sync_fixture(self):
        messages = [
            {"id": "sent-one", "subject": "RFI 91", "sender": "me@example.com",
             "toRecipients": ["manager@buildco.example"], "ccRecipients": [], "date": "2026-10-10",
             "labelIds": ["SENT"], "plaintextBody": "Hi Sam,\n\nEngineering is reviewing the package.\n\nBest,\nAlex\n\nOn Fri, Sam wrote:\n> Original private request"},
            {"id": "sent-two", "subject": "Estimate", "sender": "me@example.com",
             "toRecipients": ["buyer@market.example"], "ccRecipients": [], "date": "2026-10-09",
             "labelIds": ["SENT"], "plaintextBody": "Hello,\n\nI can send the estimate tomorrow.\n\nSent from my phone"},
        ]
        with patch.object(mail_style.gmail_api, "profile", new_callable=AsyncMock,
                          return_value={"email": "me@example.com"}), \
             patch.object(mail_style.gmail_api, "search_threads", new_callable=AsyncMock,
                          return_value={"threads": [{"id": "one"}, {"id": "two"}]}), \
             patch.object(mail_style.gmail_api, "get_thread", new_callable=AsyncMock,
                          side_effect=[{"id": "one", "messages": [messages[0]]},
                                       {"id": "two", "messages": [messages[1]]}]):
            return asyncio.run(mail_style.sync())

    def test_clean_group_exclude_and_correct(self):
        state = self._sync_fixture()
        self.assertEqual(len(state["groups"]), 2)
        build = next(group for group in state["groups"] if group["recipient_domain"] == "buildco.example")
        other = next(group for group in state["groups"] if group["recipient_domain"] == "market.example")
        example = mail_style.group_examples(build["id"])[0]
        self.assertNotIn("Original private request", example["cleaned_body"])
        self.assertNotIn("Best,", example["cleaned_body"])
        self.assertEqual(len(mail_style.examples_for(["manager@buildco.example"])), 1)
        mail_style.update_group(build["id"], name="Water project", excluded=True)
        self.assertEqual(mail_style.examples_for(["manager@buildco.example"]), [])
        mail_style.move_example(example["id"], other["id"])
        self.assertEqual(mail_style.group_examples(build["id"]), [])
        mail_style.update_group(build["id"], excluded=False)
        self.assertEqual(mail_style.examples_for(["manager@buildco.example"]), [])
        self.assertEqual(len(mail_style.examples_for(["buyer@market.example"])), 2)
        mail_style.update_account("me@example.com", True)
        self.assertEqual(mail_style.examples_for(["buyer@market.example"]), [])

    def test_draft_uses_visible_examples_and_never_sends(self):
        self._sync_fixture()
        mira = agents.create("Mira", "Coordinator")
        with patch.object(mail_style, "_draft_body", new_callable=AsyncMock,
                          return_value="Hi Sam,\n\nEngineering is reviewing the package."), \
             patch.object(mail_style.gmail_api, "profile", new_callable=AsyncMock,
                          return_value={"email": "me@example.com"}), \
             patch.object(mail_style.gmail_api, "create_draft", new_callable=AsyncMock,
                          return_value={"id": "gmail-draft-one"}) as create:
            response = self.client.post(f"/api/v1/agents/{mira['id']}/style-draft", json={
                "recipients": ["manager@buildco.example"], "subject": "Re: RFI 91",
                "brief": "Say we are still reviewing the package"})
        self.assertEqual(response.status_code, 200, response.text)
        draft = response.json()
        self.assertIsNone(draft["gmail_draft_id"])
        self.assertEqual(draft["state"], "draft")
        self.assertEqual(len(draft["sources"]), 1)
        self.assertIn("RFI 91", draft["sources"][0]["title"])
        create.assert_not_awaited()
        persisted = self.client.get(f"/api/v1/agents/{mira['id']}/artifacts").json()[0]
        self.assertEqual(persisted["sources"], draft["sources"])
        self.assertEqual(persisted["body"], "Hi Sam,\n\nEngineering is reviewing the package.")



if __name__ == "__main__":
    unittest.main()
