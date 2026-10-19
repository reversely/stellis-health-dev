"""Account-local Tavily credentials and bounded search evidence."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx

from stellis import tavily


class TavilyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
                                        "STELLIS_ACCOUNT_ID": "2"}, clear=False)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_saved_key_drives_bounded_search(self):
        tavily.save_key("tvly-private-test-credential")
        def respond(request):
            self.assertEqual(request.headers["Authorization"], "Bearer tvly-private-test-credential")
            return httpx.Response(200, json={"results": [
                {"url": "https://example.com/report", "title": "Report", "content": "Evidence"},
                {"url": "javascript:alert(1)", "title": "Unsafe", "content": "No"},
                {"url": "https://example.org/other", "title": "Other", "content": "More"}]})
        transport = httpx.MockTransport(respond)
        client_type = httpx.AsyncClient
        with patch.object(tavily.httpx, "AsyncClient",
                          side_effect=lambda **kwargs: client_type(transport=transport)):
            results = asyncio.run(tavily.search("RFI 91", limit=3))
        self.assertEqual([item["title"] for item in results], ["Report", "Other"])
        self.assertEqual(results[0]["target"], "https://example.com/report")
        tavily.remove_key()
        self.assertFalse(tavily.key_status()["configured"])
