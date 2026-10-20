"""Template deployments use real account SQLite and preserve isolation."""
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import agents, agent_runtime, agent_templates, notebooks

class TemplateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name}, clear=True)
        self.env.start()
        self.one = notebooks.create("Project one")
        self.two = notebooks.create("Project two")
    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()
    def test_stewards_are_per_notebook_and_idempotent(self):
        one = agents.deploy("steward", self.one["id"])
        again = agents.deploy("steward", self.one["id"])
        two = agents.deploy("steward", self.two["id"])
        self.assertEqual(one["id"], again["id"])
        self.assertNotEqual(one["id"], two["id"])
        self.assertEqual(agents.resolved_agent(self.one["id"])["agent"]["id"], one["id"])
        with self.assertRaisesRegex(ValueError, "one notebook"):
            agents.assign(one["id"], self.two["id"])
    def test_shared_template_and_named_copy_keep_separate_memory(self):
        one = agents.deploy("writing", self.one["id"])
        two = agents.deploy("writing", self.two["id"])
        copy = agents.deploy("writing", self.one["id"], "RFI replies", "Be concise")
        self.assertEqual(one["id"], two["id"])
        self.assertEqual(len(two["notebooks"]), 2)
        with self.assertRaisesRegex(ValueError, "Steward template"):
            agents.assign(one["id"], self.one["id"], steward=True)
        agents.save_memory(copy["id"], "Use the WT prefix")
        self.assertEqual(agents.memories(one["id"]), [])
        self.assertEqual(agents.memories(copy["id"])[0]["fact"], "Use the WT prefix")
        instructions = agent_templates.instructions(agents.get(copy["id"]))
        self.assertIn("Never send mail", instructions)
        self.assertIn("Be concise", instructions)
    def test_disabled_agents_do_not_run_or_resolve_as_steward(self):
        one = agents.deploy("steward", self.one["id"])
        agents.update(one["id"], enabled=False)
        with self.assertRaisesRegex(ValueError, "off"):
            agents.require_enabled(one["id"])
        with self.assertRaisesRegex(ValueError, "off"):
            agents.resolved_agent(self.one["id"], one["id"])
        self.assertTrue(agents.resolved_agent(self.one["id"])["agent"]["is_default"])
        self.assertFalse(agents.get(one["id"])["enabled"])
        agents.update(one["id"], enabled=True)
        self.assertEqual(agents.require_enabled(one["id"])["id"], one["id"])
    def test_prompt_contains_template_and_custom_instructions(self):
        agent = agents.deploy("tutor", self.one["id"], instructions="Start with one sketch.")
        prompt = agent_runtime._prompt(agent, [], [], "Teach me", [])
        self.assertIn("Teach one achievable step", prompt)
        self.assertIn("Start with one sketch", prompt)
        self.assertEqual(agent["behavior"]["runs"], "When you ask")
    def test_default_and_active_agent_deletion_guards(self):
        default = agents.list_agents()[0]
        with self.assertRaisesRegex(ValueError, "remain on"):
            agents.update(default["id"], name="Changed", enabled=False)
        self.assertEqual(agents.get(default["id"])["name"], default["name"])
        agent = agents.deploy("tutor", self.one["id"])
        job = agents.start_job(agent["id"])
        with self.assertRaisesRegex(ValueError, "active"):
            agents.delete(agent["id"])
        agents.finish_job(job, "succeeded")
        agents.delete(agent["id"])
        with self.assertRaises(LookupError): agents.get(agent["id"])
