"""Hosted alpha settings: open or invite-code sign-up, secure cookies, shared keys and direct agent turns."""

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
                                           "STELLIS_SECURE_COOKIES": "1"})
        self.env.start()
        self.client = TestClient(app, follow_redirects=False)
        self.credentials = {"username": "Riley", "password": "correct horse battery staple"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_sign_up_is_open_without_an_invite_code(self):
        with patch.dict(os.environ, {"STELLIS_INVITE_CODE": ""}):
            status = self.client.get("/api/v1/auth/status").json()
            self.assertTrue(status["registration_open"])
            self.assertFalse(status["invite_required"])
            response = self.client.post("/api/v1/auth/register", json=self.credentials)
            self.assertEqual(response.status_code, 200)
            self.assertIn("secure", response.headers["set-cookie"].lower())

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


class ProxyOptionsTest(unittest.TestCase):
    def test_forwarded_headers_are_trusted_only_when_configured(self):
        from stellis import cli
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(cli.proxy_options(), {"proxy_headers": False})
        with patch.dict(os.environ, {"STELLIS_FORWARDED_ALLOW_IPS": "*"}, clear=True):
            self.assertEqual(cli.proxy_options(), {"proxy_headers": True, "forwarded_allow_ips": "*"})


@unittest.skipIf(os.name == "nt", "Account child Unix sockets need a Windows transport")
class TlsProxyOriginTest(unittest.TestCase):
    """Behind a TLS proxy the browser's https Origin must match, in the gateway and in account workspaces."""

    def setUp(self):
        import socket
        import subprocess
        import sys
        import time
        from pathlib import Path
        self.temp = tempfile.TemporaryDirectory()
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        env = {key: value for key, value in os.environ.items() if not key.startswith("STELLIS_")}
        env.update(STELLIS_DATA_DIR=self.temp.name, STELLIS_AUTH_MODE="required",
                   STELLIS_FORWARDED_ALLOW_IPS="*", STELLIS_SECURE_COOKIES="1",
                   STELLIS_ACCOUNT_SOCKET_DIR=str(Path(self.temp.name) / "sockets"),
                   PYTHONPATH=str(Path(__file__).resolve().parents[1] / "src"))
        self.process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "stellis.account_gateway:app", "--host", "127.0.0.1",
             "--port", str(port), "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                if httpx.get(self.url + "/api/health", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.1)
        else:
            self.fail("Gateway did not start")

    def tearDown(self):
        self.process.terminate()
        self.process.wait(10)
        self.temp.cleanup()

    def test_https_origin_is_accepted_through_the_proxy(self):
        site = {"Host": "health.example", "Origin": "https://health.example"}
        credentials = {"username": "Riley", "password": "correct horse battery staple"}
        with httpx.Client(base_url=self.url, timeout=30) as client:
            refused = client.post("/api/v1/auth/register", json=credentials, headers=site)
            self.assertEqual(refused.status_code, 403)
            forwarded = {**site, "X-Forwarded-Proto": "https"}
            created = client.post("/api/v1/auth/register", json=credentials, headers=forwarded)
            self.assertEqual(created.status_code, 200)
            cookie = created.cookies.get("stellis_session") or created.headers["set-cookie"].split(";")[0].split("=", 1)[1]
            notebook = client.post("/api/v1/notebooks", json={"name": "Heart"},
                                   headers={**forwarded, "Cookie": f"stellis_session={cookie}"})
            self.assertEqual(notebook.status_code, 200, notebook.text)
            other = client.post("/api/v1/notebooks", json={"name": "Elsewhere"},
                                headers={**forwarded, "Origin": "https://attacker.example",
                                         "Cookie": f"stellis_session={cookie}"})
            self.assertEqual(other.status_code, 403)


class RemovedSurfacesTest(unittest.TestCase):
    def test_mcp_endpoint_is_gone(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {"STELLIS_DATA_DIR": directory, "STELLIS_AUTH_MODE": "required",
                                        "STELLIS_DEV_ACCOUNT": "0", "STELLIS_DEV_PASSWORD": ""}), \
                TestClient(app, follow_redirects=False) as client:
            client.post("/api/v1/auth/register", json={"username": "Riley", "password": "correct horse battery staple"})
            for method in ("POST", "DELETE"):
                with self.subTest(method=method):
                    self.assertEqual(client.request(method, "/mcp").status_code, 404)
            self.assertNotEqual(client.get("/mcp").status_code, 200)

    def test_mail_tutor_and_call_routes_are_gone(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {"STELLIS_DATA_DIR": directory, "STELLIS_AUTH_MODE": "required",
                                        "STELLIS_DEV_ACCOUNT": "0", "STELLIS_DEV_PASSWORD": ""}), \
                TestClient(app, follow_redirects=False) as client:
            client.post("/api/v1/auth/register", json={"username": "Riley", "password": "correct horse battery staple"})
            agent = client.get("/api/v1/agents").json()[0]["id"]
            for method, path in (("GET", "/api/v1/mail-style"), ("POST", f"/api/v1/agents/{agent}/delegations"),
                                 ("POST", f"/api/v1/agents/{agent}/tutor"), ("GET", "/api/v1/agents/voice/availability"),
                                 ("POST", f"/api/v1/agents/{agent}/call"), ("POST", "/api/v1/artifacts/one/gmail")):
                with self.subTest(path=path):
                    self.assertIn(client.request(method, path).status_code, {404, 405})
