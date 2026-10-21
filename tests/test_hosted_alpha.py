"""Hosted alpha settings: invite-only sign-up, secure cookies, shared keys and direct agent turns."""

import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from stellis import agent_gateway, agent_runtime, ai, runtime_profile, tavily
from stellis.server import app


class InviteSignUpTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name, "STELLIS_AUTH_MODE": "required",
                                           "STELLIS_DEV_ACCOUNT": "0", "STELLIS_DEV_PASSWORD": "",
                                           "STELLIS_HOSTED": "1", "STELLIS_SECURE_COOKIES": "1"})
        self.env.start()
        self.client = TestClient(app, follow_redirects=False)
        self.credentials = {"username": "Riley", "password": "correct horse battery staple"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_sign_up_is_closed_without_an_invite_code(self):
        with patch.dict(os.environ, {"STELLIS_INVITE_CODE": ""}):
            status = self.client.get("/api/v1/auth/status").json()
            self.assertFalse(status["registration_open"])
            self.assertTrue(status["invite_required"])
            self.assertEqual(self.client.post("/api/v1/auth/register", json=self.credentials).status_code, 403)

    def test_sign_up_needs_the_matching_invite_code(self):
        with patch.dict(os.environ, {"STELLIS_INVITE_CODE": "orbit-42"}):
            self.assertTrue(self.client.get("/api/v1/auth/status").json()["registration_open"])
            for code in (None, "", "orbit-41"):
                with self.subTest(code=code):
                    response = self.client.post("/api/v1/auth/register", json={**self.credentials, "invite_code": code})
                    self.assertEqual(response.status_code, 403)
            response = self.client.post("/api/v1/auth/register", json={**self.credentials, "invite_code": "orbit-42"})
            self.assertEqual(response.status_code, 200)
            self.assertIn("secure", response.headers["set-cookie"].lower())


class SharedProviderKeyTest(unittest.TestCase):
    def test_other_accounts_use_the_deployment_keys_only_when_shared(self):
        base = {"STELLIS_ACCOUNT_ID": "2", "NEBIUS_API_KEY": "nebius-shared", "TAVILY_API_KEY": "tavily-shared"}
        with patch.dict(os.environ, base, clear=True):
            self.assertIsNone(ai._host_key())
            self.assertIsNone(tavily._host_key())
        with patch.dict(os.environ, {**base, "STELLIS_SHARED_PROVIDER_KEYS": "1"}, clear=True):
            self.assertEqual(ai._host_key(), "nebius-shared")
            self.assertEqual(tavily._host_key(), "tavily-shared")


class DirectProfileTest(unittest.TestCase):
    def env(self, **values):
        return patch.dict(os.environ, {"STELLIS_RUNTIME_PROFILE": "direct", "STELLIS_ACCOUNT_ID": "1",
                                       "STELLIS_DATA_DIR": self.temp.name, **values}, clear=True)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp.cleanup()

    def test_direct_profile_needs_only_a_token_factory_key(self):
        with self.env(STELLIS_NEMOCLAW_SANDBOX="old-local"), patch.object(ai, "_host_key", return_value=None):
            self.assertTrue(runtime_profile.remote_agents())
            self.assertFalse(runtime_profile.local_inference())
            self.assertFalse(agent_runtime.configured())
        with self.env(NEBIUS_API_KEY="nebius-key"):
            self.assertTrue(agent_runtime.configured())
            self.assertEqual(runtime_profile.inference_url(), "https://api.tokenfactory.nebius.com/v1")

    def test_turn_posts_one_chat_completion_and_returns_its_text(self):
        reply = httpx.Response(200, json={"model": "m", "choices": [
            {"finish_reason": "stop", "message": {"content": " A cited answer [[source:1]] "}}]})
        post = AsyncMock(return_value=reply)
        with self.env(NEBIUS_API_KEY="nebius-key"), patch.object(httpx.AsyncClient, "post", post), \
                patch("subprocess.run", side_effect=AssertionError("Local runtime invoked")):
            answer, session = asyncio.run(agent_gateway.turn("prompt text", "job-1"))
        self.assertEqual((answer, session), ("A cited answer [[source:1]]", "job-1"))
        url = post.call_args.args[0]
        body = post.call_args.kwargs["json"]
        self.assertEqual(url, "https://api.tokenfactory.nebius.com/v1/chat/completions")
        self.assertEqual(body["messages"], [{"role": "user", "content": "prompt text"}])
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer nebius-key")

    def test_turn_reports_provider_failures_without_their_bodies(self):
        for response in (httpx.Response(429, json={}), httpx.Response(500, text="private detail"),
                         httpx.Response(200, json={"choices": [{"finish_reason": "length",
                                                                "message": {"content": "cut"}}]}),
                         httpx.Response(200, json={"choices": [{"message": {"content": ""}}]})):
            with self.subTest(status=response.status_code), self.env(NEBIUS_API_KEY="nebius-key"), \
                    patch.object(httpx.AsyncClient, "post", AsyncMock(return_value=response)), \
                    self.assertRaises(agent_gateway.GatewayError) as caught:
                asyncio.run(agent_gateway.turn("prompt", "job-1"))
            self.assertNotIn("private detail", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
