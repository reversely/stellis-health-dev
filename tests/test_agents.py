"""Agent identity, notebook stewardship, memory, and durable thread checks."""

import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import agents, notebooks, storage
from stellis.server import app


class AgentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name, "STELLIS_AUTH_MODE": "off"})
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_prompt_creates_steward_and_persists(self):
        book = notebooks.create("Water Treatment")
        response = self.client.post("/api/v1/agents", json={
            "prompt": "Make Mira my project coordinator; she should keep the Water Treatment notebook current"})
        self.assertEqual(response.status_code, 200, response.text)
        mira = response.json()
        self.assertEqual((mira["name"], mira["role"], mira["slug"]),
                         ("Mira", "project coordinator", "mira"))
        self.assertEqual(mira["notebooks"][0]["notebook_id"], book["id"])
        self.assertTrue(mira["notebooks"][0]["is_steward"])
        self.assertEqual(agents.resolved_agent(book["id"])["agent"]["id"], mira["id"])
        fallback = agents.resolved_agent()
        self.assertEqual((fallback["agent"]["name"], fallback["reason"]), ("General", "general_default"))
        self.assertEqual(agents.resolved_agent(explicit_id=mira["id"])["agent"]["id"], mira["id"])
        self.assertEqual(agents.resolved_agent(book["id"], mira["id"])["reason"], "explicit")
        self.client.close()
        self.client = TestClient(app)
        self.assertEqual(self.client.get(f"/api/v1/agents/{mira['id']}").json()["name"], "Mira")
        self.assertEqual(len(self.client.get("/api/v1/agents").json()), 2)  # General and Mira

    def test_legacy_agent_column_migrates_and_general_is_fallback(self):
        mira = agents.create("Mira", "Coordinator")
        book = notebooks.create("Unassigned")
        with sqlite3.connect(storage.data_dir() / "stellis.sqlite3") as conn:
            conn.execute("ALTER TABLE agents RENAME COLUMN slug TO openclaw_id")
            conn.execute("UPDATE agents SET openclaw_id = 'main' WHERE is_default = 1")
        restored = {item["name"]: item for item in agents.list_agents()}
        self.assertEqual(restored["General"]["slug"], "main")  # Preserve existing identifiers.
        self.assertEqual(restored["Mira"]["slug"], mira["slug"])
        self.assertEqual(agents.resolved_agent(book["id"])["agent"]["id"], restored["General"]["id"])

    def test_steward_reassignment_keeps_other_assignment(self):
        first = notebooks.create("First")
        second = notebooks.create("Second")
        mira = agents.create("Mira", "Coordinator", notebook_id=first["id"], steward=True)
        ivo = agents.create("Ivo", "Designer", notebook_id=second["id"], steward=True)
        agents.assign(ivo["id"], first["id"], True)
        self.assertEqual(agents.resolved_agent(first["id"])["agent"]["id"], ivo["id"])
        self.assertFalse(agents.get(mira["id"])["notebooks"][0]["is_steward"])
        self.assertEqual(agents.resolved_agent(second["id"])["agent"]["id"], ivo["id"])

    def test_memory_is_correctable_and_not_a_source_citation(self):
        agent = agents.create("Mira", "Coordinator")
        saved = self.client.post(f"/api/v1/agents/{agent['id']}/memories", json={
            "kind": "email_convention", "fact": "RFI subjects begin WT-04", "source_id": "mail:one"})
        self.assertEqual(saved.status_code, 200)
        memory = saved.json()
        updated = self.client.put(f"/api/v1/agents/{agent['id']}/memories/{memory['id']}", json={
            "kind": "email_convention", "fact": "RFI subjects begin WT-04 RFI", "source_id": "mail:one"})
        self.assertEqual(updated.json()["fact"], "RFI subjects begin WT-04 RFI")
        self.assertEqual(self.client.get(f"/api/v1/agents/{agent['id']}/memories").json()[0]["id"], memory["id"])
        self.assertEqual(self.client.delete(f"/api/v1/agents/{agent['id']}/memories/{memory['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/agents/{agent['id']}/memories").json(), [])

    def test_one_agent_thread_holds_messages_from_multiple_notebooks(self):
        first = notebooks.create("First")
        second = notebooks.create("Second")
        agent = agents.create("Mira", "Coordinator")
        agents.append_message(agent["id"], "user", "Review the first project", first["id"])
        agents.append_message(agent["id"], "agent", "First project reviewed", first["id"], "job-1")
        agents.append_message(agent["id"], "user", "Review the second project", second["id"])
        rows = self.client.get(f"/api/v1/agents/{agent['id']}/messages").json()
        self.assertEqual([row["notebook_id"] for row in rows], [first["id"], first["id"], second["id"]])
        self.assertEqual(rows[1]["job_id"], "job-1")


if __name__ == "__main__":
    unittest.main()
