"""Bounded specialist jobs, fixture evidence, drafts, and cancellation."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from stellis import agents, delegation, notebooks


class DelegationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
                                         "STELLIS_AUTH_MODE": "off"})
        self.env.start()
        self.book = notebooks.create("Water Treatment")
        self.steward = agents.create("Mira", "Coordinator", notebook_id=self.book["id"], steward=True)
        self.specialist = agents.create("Sol", "Construction specialist")
        self.case = {"installed": True, "projects": [{"notebook_id": self.book["id"]}]}
        self.source = {"source_id": "mail:sample-rfi91-block", "title": "RFI 91 email",
                       "excerpt": "The revised schedule and certificate are missing.",
                       "target": "/api/v1/samples/rfi91/mail/sample-rfi91-block"}

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def _job(self):
        with patch.object(delegation.sample_rfi91, "status", return_value=self.case):
            return delegation.create(self.steward["id"], self.specialist["id"], self.book["id"],
                                     "Why is RFI 91 open?", "manager@buildco.example",
                                     "Re: RFI 91", fixture=True)

    def test_fixture_job_returns_cited_research_and_draft(self):
        job = self._job()
        async def turn(_specialist, instruction, sources, _session, **_kwargs):
            self.assertEqual(sources[0]["source_id"], self.source["source_id"])
            if "Research this" in instruction:
                return ("The revised schedule is missing " +
                        "[RFI 91 email](/api/v1/samples/rfi91/mail/sample-rfi91-block)")
            return ("Hello,\n\nRFI 91 remains under engineering review. The revised valve "
                    "schedule is needed before closure. We will update the construction manager "
                    "once the certificate review and engineering sign-off are complete. "
                    "[RFI 91 email](/api/v1/samples/rfi91/mail/sample-rfi91-block)")
        with patch.object(delegation.fixture_mailbox, "rfi91_sources", return_value=[self.source]), \
             patch.object(delegation, "_managed_turn", side_effect=turn) as managed:
            asyncio.run(delegation._run(job["id"]))
        result = delegation.jobs(self.steward["id"])[0]
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(managed.await_count, 2)
        self.assertIn("sample-rfi91-block", result["research"])
        self.assertIn("RFI 91 remains under engineering review", result["draft_body"])
        self.assertNotIn("sample-rfi91-block", result["draft_body"])
        self.assertEqual(result["sources"][0]["source_id"], "mail:sample-rfi91-block")
        self.assertTrue(result["gmail_draft_id"].startswith("sample-draft-"))
        self.assertEqual(result["tools_used"], ["Stellis source search", "Sample mailbox",
                                                "Managed specialist", "Sample draft"])
        self.assertEqual(agents.messages(self.steward["id"])[0]["role"], "system")

    def test_specialist_uses_managed_cli_helper_path(self):
        process = type("Process", (), {"returncode": 0,
            "communicate": AsyncMock(return_value=(
                b'{"status":"ok","result":{"payloads":[{"text":"Review is open."}],"meta":{}}}', b""))})()
        with patch.dict(os.environ, {"STELLIS_NEMOCLAW_SANDBOX": "test-agent"}), \
             patch.object(delegation.agent_runtime, "_command",
                          return_value="/opt/nemoclaw/bin/nemoclaw"), \
             patch.object(delegation.asyncio, "create_subprocess_exec",
                          new_callable=AsyncMock, return_value=process) as launch:
            answer = asyncio.run(delegation._managed_turn(
                self.specialist, "Summarize", [], "test-session", require_citations=False))
        self.assertEqual(answer, "Review is open.")
        self.assertEqual(launch.await_args.kwargs["env"]["PATH"].split(os.pathsep)[0],
                         "/opt/nemoclaw/bin")

    def test_specialist_canonicalizes_only_retrieved_links(self):
        expected = ("Finding [RFI 91 email]"
                    "(/api/v1/samples/rfi91/mail/sample-rfi91-block)")
        process = type("Process", (), {"returncode": 0,
            "communicate": AsyncMock(return_value=(
                ('{"status":"ok","result":{"payloads":[{"text":' +
                 __import__("json").dumps(expected) + '}],"meta":{}}}').encode(), b""))})()
        with patch.dict(os.environ, {"STELLIS_NEMOCLAW_SANDBOX": "test-agent"}), \
             patch.object(delegation.asyncio, "create_subprocess_exec",
                          new_callable=AsyncMock, return_value=process):
            answer = asyncio.run(delegation._managed_turn(
                self.specialist, "Summarize", [self.source], "test-session"))
        self.assertEqual(answer, expected)

    def test_cancel_stops_before_draft_tool(self):
        job = self._job()
        async def check():
            entered = asyncio.Event()
            async def hanging(*_args, **_kwargs):
                entered.set()
                await asyncio.Future()
            with patch.object(delegation.fixture_mailbox, "rfi91_sources", return_value=[self.source]), \
                 patch.object(delegation, "_managed_turn", side_effect=hanging), \
                 patch.object(delegation.fixture_mailbox.FixtureMailbox, "create_draft") as draft:
                delegation.start(job["id"])
                await entered.wait()
                delegation.cancel(job["id"], self.steward["id"])
                await asyncio.sleep(0)
                self.assertEqual(delegation.jobs(self.steward["id"])[0]["state"], "interrupted")
                draft.assert_not_called()
        asyncio.run(check())

    def test_live_job_requires_managed_tavily(self):
        with self.assertRaisesRegex(ValueError, "Tavily research"):
            delegation.create(self.steward["id"], self.specialist["id"], self.book["id"],
                              "Research RFI 91", "manager@buildco.example", "Re: RFI 91")

    def test_one_active_job_per_steward(self):
        self._job()
        with self.assertRaisesRegex(ValueError, "already has a running job"):
            self._job()

    def test_draft_keeps_review_sources_out_of_outgoing_body(self):
        raw = ("Subject: Re: RFI 91\n\nHi [Manager Name],\n\nEngineering review is still open "
               "[RFI 91 email](/api/v1/samples/rfi91/mail/sample-rfi91-block).\n\n"
               "Regards,\nSol\n\n[RFI 91 status](/page/one)")
        self.assertEqual(delegation._clean_email_body(raw),
                         "Hello,\n\nEngineering review is still open.")
        self.assertEqual(delegation._clean_email_body("Re: RFI 91\n\nHello,\n\nReview is open.",
                                                    "Re: RFI 91"), "Hello,\n\nReview is open.")
        self.assertFalse(delegation._usable_draft("Your email is being processed. Please wait.", True))
        self.assertTrue(delegation._usable_draft(delegation._RFI91_SAMPLE_DRAFT, True))
        unsafe = ("RFI 91 engineering sign-off is open. The certificate and valve schedule "
                  "are needed; please provide both by October 22 before closure.")
        self.assertFalse(delegation._usable_draft(unsafe, True))


if __name__ == "__main__":
    unittest.main()
