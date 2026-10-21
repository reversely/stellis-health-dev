"""Managed tool registration survives normal gateway restarts."""

import json
import os
import subprocess
import unittest
from unittest.mock import patch

from stellis import agent_runtime


def state(tavily: bool) -> str:
    return json.dumps({"bridges": [{"server": "tavily", "provider": {"credentialReady": True},
                                    "policy": {"state": "configured"}, "adapter": {"registered": tavily}}]})


class ManagedMcpRecoveryTests(unittest.TestCase):
    def test_recovers_an_unregistered_bridge_and_verifies_it(self) -> None:
        responses = [subprocess.CompletedProcess([], 0, state(False), ""),
                     subprocess.CompletedProcess([], 0, "", ""),
                     subprocess.CompletedProcess([], 0, state(True), "")]
        env = {"STELLIS_ACCOUNT_ID": "1", "STELLIS_NEMOCLAW_SANDBOX": "sandbox",
               "STELLIS_TAVILY_MCP_READY": "1"}
        with patch.dict(os.environ, env), \
             patch.object(agent_runtime, "_command", return_value="/bin/nemoclaw"), \
             patch("stellis.tavily.available_key", return_value="test-key"), \
             patch.object(agent_runtime.subprocess, "run", side_effect=responses) as run:
            agent_runtime._reconcile_managed_mcp()
        self.assertEqual([call.args[0][-2:] for call in run.call_args_list],
                         [["list", "--json"], ["restart", "tavily"], ["list", "--json"]])

    def test_missing_required_bridge_stops_turn(self) -> None:
        payload = json.dumps({"bridges": []})
        env = {"STELLIS_ACCOUNT_ID": "1", "STELLIS_NEMOCLAW_SANDBOX": "sandbox",
               "STELLIS_TAVILY_MCP_READY": "1"}
        with patch.dict(os.environ, env), \
             patch.object(agent_runtime, "_command", return_value="/bin/nemoclaw"), \
             patch("stellis.tavily.available_key", return_value="test-key"), \
             patch.object(agent_runtime.subprocess, "run",
                          return_value=subprocess.CompletedProcess([], 0, payload, "")):
            with self.assertRaises(agent_runtime.AgentRunError):
                agent_runtime._reconcile_managed_mcp()

    def test_other_accounts_do_not_touch_owner_sandbox(self) -> None:
        env = {"STELLIS_ACCOUNT_ID": "2", "STELLIS_NEMOCLAW_SANDBOX": "",
               "STELLIS_TAVILY_MCP_READY": ""}
        with patch.dict(os.environ, env), patch.object(agent_runtime.subprocess, "run") as run:
            agent_runtime._reconcile_managed_mcp()
        run.assert_not_called()
