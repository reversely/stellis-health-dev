"""NemoClaw owns Gmail MCP registration and credential rotation."""

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

    def test_isolated_walkthrough_does_not_start_live_sync(self):
        with patch.dict(os.environ, {"STELLIS_GMAIL_MCP_SYNC": "off"}), \
             patch.object(gmail_mcp.threading, "Thread") as thread:
            gmail_mcp.start()
        thread.assert_not_called()

    async def test_register_then_rotate_only_after_token_change(self):
        calls = []
        present = [False, True, True]
        def run(*args, token=None):
            calls.append((args, token))
            return subprocess.CompletedProcess(args, 0, "", "")
        status = {"adapter": {"registered": True}, "provider": {"state": "configured"}}
        with patch.object(gmail_mcp.calendar, "connections", return_value=[
            {"provider": "google", "mail_connected": True}]), \
             patch.object(gmail_mcp.calendar, "_access_token", new_callable=AsyncMock,
                          side_effect=["first", "first", "second"]) as access, \
             patch.object(gmail_mcp, "_registered", side_effect=lambda _: present.pop(0)), \
             patch.object(gmail_mcp, "_managed_status", return_value=status), \
             patch.object(gmail_mcp, "_remove_managed") as remove, \
             patch.object(gmail_mcp, "_run", side_effect=run):
            await gmail_mcp.sync_once()
            await gmail_mcp.sync_once()
            await gmail_mcp.sync_once()
        self.assertEqual([call[0][2] for call in calls], ["add", "add"])
        self.assertEqual([call[1] for call in calls], ["first", "second"])
        remove.assert_called_once_with("test-agent")
        self.assertTrue(all(call.kwargs["min_validity"] == 600 for call in access.await_args_list))

    async def test_restart_replaces_existing_managed_registration(self):
        with patch.object(gmail_mcp.calendar, "connections", return_value=[
            {"provider": "google", "mail_connected": True}]), \
             patch.object(gmail_mcp.calendar, "_access_token", new_callable=AsyncMock,
                          return_value="same-token"), \
             patch.object(gmail_mcp, "_registered", return_value=True), \
             patch.object(gmail_mcp, "_remove_managed") as remove, \
             patch.object(gmail_mcp, "_run", return_value=subprocess.CompletedProcess([], 0)) as run:
            await gmail_mcp.sync_once()
        remove.assert_called_once_with("test-agent")
        self.assertEqual(run.call_args.args[2:5], ("add", "gmail", "--url"))
        self.assertEqual(run.call_args.kwargs["token"], "same-token")

    async def test_disconnect_removes_managed_access_and_retained_provider(self):
        with patch.object(gmail_mcp.calendar, "connections", return_value=[
            {"provider": "google", "mail_connected": False}]), \
             patch.object(gmail_mcp, "_registered", return_value=True), \
             patch.object(gmail_mcp, "_remove_managed") as remove:
            await gmail_mcp.sync_once()
        remove.assert_called_once_with("test-agent")

    def test_remove_retired_provider_only_after_detachment(self):
        status = {"provider": {"name": "test-agent-mcp-gmail", "present": True}}
        def openshell(*args):
            if args[:3] == ("sandbox", "provider", "list"):
                return subprocess.CompletedProcess(args, 0, "NAME TYPE\nother openai\n", "")
            return subprocess.CompletedProcess(args, 0, "", "")
        with patch.object(gmail_mcp, "_managed_status", return_value=status), \
             patch.object(gmail_mcp, "_run", return_value=subprocess.CompletedProcess([], 0)) as remove, \
             patch.object(gmail_mcp, "_run_openshell", side_effect=openshell) as helper:
            gmail_mcp._remove_managed("test-agent")
        remove.assert_called_once_with("test-agent", "mcp", "remove", "gmail")
        helper.assert_any_call("provider", "delete", "test-agent-mcp-gmail")

    def test_retained_provider_is_not_deleted_while_attached(self):
        status = {"provider": {"name": "test-agent-mcp-gmail", "present": True}}
        listing = subprocess.CompletedProcess([], 0, "NAME TYPE\ntest-agent-mcp-gmail nemoclaw-mcp-v1\n", "")
        with patch.object(gmail_mcp, "_managed_status", return_value=status), \
             patch.object(gmail_mcp, "_run", return_value=subprocess.CompletedProcess([], 0)), \
             patch.object(gmail_mcp, "_run_openshell", return_value=listing) as helper:
            with self.assertRaisesRegex(RuntimeError, "still attached"):
                gmail_mcp._remove_managed("test-agent")
        self.assertEqual(helper.call_count, 1)

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


if __name__ == "__main__":
    unittest.main()
