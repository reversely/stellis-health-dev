"""Managed tool registration survives normal gateway restarts."""

import json
import os
import subprocess
import unittest
from unittest.mock import patch

from stellis import agent_runtime


def state(stellis: bool, tavily: bool) -> str:
    def bridge(name: str, registered: bool) -> dict:
        return {"server": name, "provider": {"credentialReady": True},
                "policy": {"state": "configured"}, "adapter": {"registered": registered}}
    return json.dumps({"bridges": [bridge("stellis", stellis), bridge("tavily", tavily)]})


class ManagedMcpRecoveryTests(unittest.TestCase):
    def test_recovers_only_mismatched_bridges_and_verifies_both(self) -> None:
        responses = [subprocess.CompletedProcess([], 0, state(False, True), ""),
                     subprocess.CompletedProcess([], 0, "", ""),
                     subprocess.CompletedProcess([], 0, state(True, True), "")]
        env = {"STELLIS_ACCOUNT_ID": "1", "STELLIS_NEMOCLAW_SANDBOX": "sandbox",
               "STELLIS_TAVILY_MCP_READY": "1"}
        with patch.dict(os.environ, env), \
             patch.object(agent_runtime, "_command", return_value="/bin/nemoclaw"), \
             patch("stellis.tavily.available_key", return_value="test-key"), \
             patch.object(agent_runtime.subprocess, "run", side_effect=responses) as run:
            agent_runtime._reconcile_managed_mcp()
        self.assertEqual([call.args[0][-2:] for call in run.call_args_list],
                         [["list", "--json"], ["restart", "stellis"], ["list", "--json"]])

    def test_missing_required_bridge_stops_turn(self) -> None:
        payload = json.dumps({"bridges": [{"server": "stellis",
            "provider": {"credentialReady": True}, "policy": {"state": "configured"},
            "adapter": {"registered": True}}]})
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
