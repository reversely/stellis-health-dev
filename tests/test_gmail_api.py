"""Gmail API mail-tool shapes and draft-only behavior."""

import asyncio
import base64
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from stellis import gmail_api
from stellis.calendar import CalendarError


class GmailAPITest(unittest.TestCase):
    def test_search_thread_and_draft_shapes(self):
        calls = []
        encoded = base64.urlsafe_b64encode(b"The engineer has not signed off.").decode()

        def respond(request):
            calls.append((request.method, request.url.path, dict(request.url.params)))
            if request.url.path.endswith("/threads"):
                self.assertIn("subject:RFI", request.url.params["q"])
                return httpx.Response(200, json={"threads": [{"id": "thread-1"}], "resultSizeEstimate": 1})
            if request.url.path.endswith("/threads/thread-1"):
                return httpx.Response(200, json={"id": "thread-1", "messages": [{
                    "id": "message-1", "snippet": "The engineer", "internalDate": "1791331200000",
                    "labelIds": ["INBOX", "Label_Project"], "payload": {"mimeType": "multipart/alternative",
                    "headers": [{"name": "Subject", "value": "WT-04 RFI 91"},
                                {"name": "From", "value": "manager@example.com"},
                                {"name": "To", "value": "me@example.com"}],
                    "parts": [{"mimeType": "text/plain", "body": {"data": encoded}}]}}]})
            if request.url.path.endswith("/drafts"):
                payload = json.loads(request.content)
                raw = base64.urlsafe_b64decode(payload["message"]["raw"]).decode()
                self.assertIn("Subject: Re: WT-04 RFI 91", raw)
                self.assertIn("Engineering is reviewing", raw)
                return httpx.Response(200, json={"id": "draft-1"})
            raise AssertionError(request.url)

        transport = httpx.MockTransport(respond)
        client_type = httpx.AsyncClient
        factory = lambda **kwargs: client_type(transport=transport, **kwargs)

        async def exercise():
            found = await gmail_api.search_threads("label:Label_Project subject:RFI")
            self.assertEqual(found["resultCountEstimate"], "1")
            self.assertNotIn("plaintextBody", found["threads"][0]["messages"][0])
            thread = await gmail_api.get_thread("thread-1")
            self.assertEqual(thread["messages"][0]["plaintextBody"], "The engineer has not signed off.")
            draft = await gmail_api.create_draft(["manager@example.com"], "Re: WT-04 RFI 91",
                                                  "Engineering is reviewing the package.")
            self.assertEqual(draft, {"id": "draft-1"})

        with patch.object(gmail_api.calendar, "connections", return_value=[
                {"provider": "google", "mail_connected": True}]), \
             patch.object(gmail_api.calendar, "_access_token", new_callable=AsyncMock,
                          return_value="private-token"), \
             patch.object(gmail_api.httpx, "AsyncClient", side_effect=factory):
            asyncio.run(exercise())
        self.assertEqual([method for method, _, _ in calls], ["GET", "GET", "GET", "POST"])
        self.assertTrue(all("send" not in path for _, path, _ in calls))

    def test_disconnected_mail_never_calls_provider(self):
        with patch.object(gmail_api.calendar, "connections", return_value=[
                {"provider": "google", "mail_connected": False}]), \
             patch.object(gmail_api.calendar, "_access_token", new_callable=AsyncMock) as token:
            with self.assertRaisesRegex(gmail_api.GmailError, "Connect Gmail"):
                asyncio.run(gmail_api.search_threads("subject:RFI"))
            token.assert_not_called()

    def test_expired_or_changed_grant_requests_reconnection(self):
        with patch.object(gmail_api.calendar, "connections", return_value=[
                {"provider": "google", "mail_connected": True}]), \
             patch.object(gmail_api.calendar, "_access_token", new_callable=AsyncMock,
                          side_effect=CalendarError("Private OAuth detail")):
            with self.assertRaisesRegex(gmail_api.GmailError, "Reconnect Gmail"):
                asyncio.run(gmail_api.search_threads("subject:RFI"))


if __name__ == "__main__":
    unittest.main()
