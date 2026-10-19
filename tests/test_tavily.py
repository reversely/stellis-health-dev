"""Account-local Tavily credentials and bounded search evidence."""

import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch


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

    def test_saved_key_is_private_and_removable(self):
        tavily.save_key("tvly-private-test-credential")
        self.assertEqual(tavily.available_key(), "tvly-private-test-credential")
        self.assertEqual(tavily.key_status()["source"], "saved")
        tavily.remove_key()
        self.assertFalse(tavily.key_status()["configured"])

    def test_owner_key_rotation_updates_managed_provider(self):
        with patch.dict(os.environ, {"STELLIS_ACCOUNT_ID": "1",
                                          "STELLIS_NEMOCLAW_SANDBOX": "test-sandbox"}), \
             patch.object(tavily, "_host_key", return_value="tvly-original-host-key"), \
             patch.object(tavily, "_sync_managed") as sync:
            tavily.save_key("tvly-new-owner-key")
            sync.assert_called_once_with("tvly-new-owner-key")
            self.assertEqual(tavily.available_key(), "tvly-new-owner-key")
            tavily.remove_key()
            self.assertEqual(sync.call_args.args, ("tvly-original-host-key",))
            self.assertEqual(tavily.available_key(), "tvly-original-host-key")

    def test_failed_rotation_restores_previous_managed_key(self):
        with patch.dict(os.environ, {"STELLIS_ACCOUNT_ID": "1",
                                          "STELLIS_NEMOCLAW_SANDBOX": "test-sandbox"}), \
             patch.object(tavily, "_host_key", return_value="tvly-original-host-key"), \
             patch.object(tavily, "_sync_managed", side_effect=[
                 RuntimeError("Could not update managed Tavily access"), None]) as sync:
            with self.assertRaisesRegex(RuntimeError, "managed Tavily"):
                tavily.save_key("tvly-bad-new-key")
            self.assertIsNone(tavily.saved_key())
            self.assertEqual([call.args[0] for call in sync.call_args_list],
                             ["tvly-bad-new-key", "tvly-original-host-key"])


    def test_managed_rotation_uses_nemoclaw_lifecycle(self):
        commands = []
        def command(argv, **kwargs):
            commands.append((argv, kwargs["env"].get("STELLIS_TAVILY_MCP_TOKEN")))
            output = ('{"provider":{"credentialReady":true},"adapter":{"registered":true}}'
                      if "status" in argv else "")
            return subprocess.CompletedProcess(argv, 0, output, "")
        with patch.dict(os.environ, {"STELLIS_ACCOUNT_ID": "1",
                                          "STELLIS_NEMOCLAW_SANDBOX": "test-sandbox",
                                          "STELLIS_MCP_TOKEN": "private-test-token"}), \
             patch.object(tavily.subprocess, "run", side_effect=command):
            tavily._sync_managed("tvly-owner-test-key")
        self.assertEqual(commands[0][0][-3:], ["remove", "tavily", "--force"])
        self.assertEqual(commands[1][0][1:3], ["provider", "delete"])
        self.assertTrue(any("add" in args for args, _ in commands))
        self.assertTrue(any("restart" in args and "stellis" in args for args, _ in commands))
        self.assertTrue(all(value == "tvly-owner-test-key" for _, value in commands))
