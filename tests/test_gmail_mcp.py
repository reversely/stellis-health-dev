"""Backend credential rotation for the managed Gmail MCP connection."""

import os
import subprocess
import unittest
from unittest.mock import AsyncMock, patch

from stellis import gmail_mcp


class GmailMcpTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        gmail_mcp._last_token_hash = None
        self.environment = patch.dict(os.environ, {"STELLIS_NEMOCLAW_SANDBOX": "test-agent"})
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        gmail_mcp._last_token_hash = None

    async def test_register_and_rotate_refreshed_token(self):
        calls = []
        present = [False, True, True]

        def run(*args, token=None):
            calls.append((args, token))
            return subprocess.CompletedProcess(args, 0, "", "")

        with patch.object(gmail_mcp.calendar, "connections", return_value=[
            {"provider": "google", "mail_connected": True}]), \
             patch.object(gmail_mcp.calendar, "_access_token", new_callable=AsyncMock,
                          side_effect=["first", "first", "second"]) as access, \
             patch.object(gmail_mcp, "_registered", side_effect=lambda sandbox: present.pop(0)), \
             patch.object(gmail_mcp, "_run", side_effect=run):
            await gmail_mcp.sync_once()
            await gmail_mcp.sync_once()
            await gmail_mcp.sync_once()

        self.assertEqual([call[0][2] for call in calls], ["add", "remove", "add"])
        self.assertEqual([call[1] for call in calls], ["first", None, "second"])
        self.assertNotIn("first", calls[0][0])
        self.assertNotIn("second", calls[2][0])
        self.assertTrue(all(call.kwargs["min_validity"] == 600 for call in access.await_args_list))

    async def test_disconnect_removes_managed_server(self):
        calls = []

        def run(*args, token=None):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, "", "")

        with patch.object(gmail_mcp.calendar, "connections", return_value=[
            {"provider": "google", "mail_connected": False}]), \
             patch.object(gmail_mcp, "_registered", return_value=True), \
             patch.object(gmail_mcp, "_run", side_effect=run):
            await gmail_mcp.sync_once()
        self.assertEqual(calls, [("test-agent", "mcp", "remove", "gmail")])

    def test_absolute_cli_adds_sibling_helper_to_path(self):
        with patch.object(gmail_mcp, "_command", return_value="/opt/nemoclaw/bin/nemoclaw"), \
             patch.object(gmail_mcp.subprocess, "run",
                          return_value=subprocess.CompletedProcess([], 0)) as run:
            gmail_mcp._run("test-agent", "mcp", "list")
        self.assertEqual(run.call_args.kwargs["env"]["PATH"].split(os.pathsep)[0],
                         "/opt/nemoclaw/bin")

    def test_cli_receives_token_only_in_environment(self):
        with patch.object(gmail_mcp, "_command", return_value="nemoclaw"), \
             patch.object(gmail_mcp.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            gmail_mcp._run("test-agent", "mcp", "add", "gmail", token="private-token")
        self.assertNotIn("private-token", run.call_args.args[0])
        self.assertEqual(run.call_args.kwargs["env"][gmail_mcp.TOKEN_ENV], "private-token")
