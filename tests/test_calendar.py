"""OAuth boundaries and read-only calendar integration checks."""

import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi.testclient import TestClient

from stellis import calendar
from stellis.server import app


class CalendarTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            "STELLIS_DATA_DIR": self.temp.name,
            "STELLIS_GOOGLE_CALENDAR_CLIENT_ID": "google-test-id",
            "STELLIS_MICROSOFT_CALENDAR_CLIENT_ID": "microsoft-test-id",
            "STELLIS_AUTH_MODE": "off",
        })
        self.env.start()
        calendar._pending.clear()

    def tearDown(self):
        calendar._pending.clear()
        self.env.stop()
        self.temp.cleanup()

    def test_authorization_state_and_loopback_redirect(self):
        for provider in calendar.PROVIDERS:
            url = calendar.authorize(provider, 8765, "http://127.0.0.1:8765")
            query = parse_qs(urlparse(url).query)
            self.assertEqual(query["code_challenge_method"], ["S256"])
            self.assertEqual(query["redirect_uri"], [calendar.redirect_uri(provider, 8765)])
            if provider == "google":
                self.assertEqual(query["scope"], ["https://www.googleapis.com/auth/calendar.events.readonly"])
            else:
                self.assertEqual(query["scope"], ["offline_access Calendars.ReadBasic"])
            state = query["state"][0]
            with self.assertRaises(calendar.CalendarError):
                calendar.consume_state("microsoft" if provider == "google" else "google", state)
            with self.assertRaises(calendar.CalendarError):
                calendar.consume_state(provider, state)
        with TestClient(app, base_url="http://example.com:8765") as client:
            self.assertEqual(client.get("/api/v1/calendar/google/authorize").status_code, 400)

    async def test_exchange_refresh_events_and_disconnect(self):
        calls = []

        def handler(request):
            calls.append(request)
            if request.url.path.endswith("/token"):
                if b"grant_type=refresh_token" in request.content:
                    return httpx.Response(200, json={"access_token": "new-access", "expires_in": 3600})
                return httpx.Response(200, json={"access_token": "access", "refresh_token": "refresh", "expires_in": 60})
            if "googleapis" in request.url.host:
                self.assertEqual(request.headers["Authorization"], "Bearer new-access")
                if "pageToken" not in request.url.params:
                    return httpx.Response(200, json={"items": [{"id":"a","summary":"Planning","start":{"dateTime":"2026-10-17T10:00:00Z"},"end":{"dateTime":"2026-10-17T11:00:00Z"}}],"nextPageToken":"next"})
                return httpx.Response(200, json={"items": [{"id":"b","summary":"Day off","start":{"date":"2026-10-18"},"end":{"date":"2026-10-19"}}]})
            return httpx.Response(404)

        original = httpx.AsyncClient
        with patch.object(calendar.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            await calendar.exchange("google", "code", "verifier", calendar.redirect_uri("google", 8765))
            with calendar._connect() as conn:
                conn.execute("UPDATE connections SET expires_at = 0 WHERE provider = 'google'")
            events = await calendar.events("google", datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertEqual([event["title"] for event in events], ["Planning", "Day off"])
        self.assertEqual(events[1]["start"], "2026-10-18")
        self.assertTrue(events[1]["all_day"])
        self.assertEqual(len([call for call in calls if call.url.path.endswith("/token")]), 2)
        calendar.disconnect("google")
        self.assertFalse(next(row for row in calendar.connections() if row["provider"] == "google")["connected"])

    async def test_microsoft_pagination_and_untrusted_next_link(self):
        calendar._save("microsoft", {"access_token":"access","refresh_token":"refresh","expires_in":3600})

        def handler(request):
            if "skiptoken" in request.url.params:
                return httpx.Response(200, json={"value":[{"id":"two","subject":"Review","start":{"dateTime":"2026-10-18T12:00:00"},"end":{"dateTime":"2026-10-18T13:00:00"}}]})
            return httpx.Response(200, json={"value":[{"id":"one","subject":"Meet","start":{"dateTime":"2026-10-17T12:00:00"},"end":{"dateTime":"2026-10-17T13:00:00"}}],
                "@odata.nextLink":"https://graph.microsoft.com/v1.0/me/calendar/calendarView?skiptoken=next"})

        original = httpx.AsyncClient
        with patch.object(calendar.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            events = await calendar.events("microsoft", datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertEqual([item["title"] for item in events], ["Meet", "Review"])
        with patch.object(calendar.httpx, "AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"value":[],"@odata.nextLink":"https://evil.example/steal"})), **kw)):
            with self.assertRaises(calendar.CalendarError):
                await calendar.events("microsoft")


class CalendarRouteTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
            "STELLIS_GOOGLE_CALENDAR_CLIENT_ID":"google-test-id", "STELLIS_AUTH_MODE":"off"})
        self.env.start()
        self.client = TestClient(app, base_url="http://127.0.0.1:8765", follow_redirects=False)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_authorize_callback_and_empty_meetings(self):
        authorization = self.client.get("/api/v1/calendar/google/authorize")
        self.assertEqual(authorization.status_code, 200)
        state = parse_qs(urlparse(authorization.json()["url"]).query)["state"][0]
        response = self.client.get("/api/v1/calendar/google/callback", params={"state":state,"error":"access_denied"})
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "http://127.0.0.1:8765/?calendar=failed")
        self.assertEqual(self.client.get("/api/v1/calendar/meetings").json()["meetings"], [])

    def test_calendar_routes_keep_local_login_boundary(self):
        with patch.dict(os.environ, {"STELLIS_AUTH_MODE":"required", "STELLIS_DEV_ACCOUNT":"0"}):
            self.assertEqual(self.client.get("/api/v1/calendar/connections").status_code, 401)
            self.assertEqual(self.client.get("/api/v1/calendar/google/authorize").status_code, 401)
            self.assertEqual(self.client.get("/api/v1/calendar/meetings").status_code, 401)
            self.assertEqual(self.client.post("/api/v1/calendar/google/disconnect").status_code, 401)
            self.assertEqual(self.client.get("/api/v1/calendar/google/callback").status_code, 303)
