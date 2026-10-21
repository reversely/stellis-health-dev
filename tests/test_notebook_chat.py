"""Notebook chat reads only the checked sources and returns citations the server built."""
import json
import os
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from stellis import agent_gateway, notebook_chat, notebooks, pages, storage
from stellis.server import app

STAMP = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc).isoformat()


def _conversation(book: str, title: str, segments: list[tuple[int, str]]) -> str:
    identifier = str(uuid.uuid4())
    storage.add_conversation({"id": identifier, "title": title, "source_sha256": identifier, "audio_filename": "a.mp3",
                              "audio_media_type": "audio/mpeg", "duration_ms": 60000, "created_at": STAMP,
                              "notebook_id": book})
    storage.save_transcript({"conversation_id": identifier, "revision": 1, "language": "en", "turns_json": "[]",
                             "updated_at": STAMP, "segments_json": json.dumps([
                                 {"id": f"seg-{start}", "start_ms": start, "end_ms": start + 4000, "text": text,
                                  "speaker_cluster_id": "speaker-1", "speaker_uncertain": False, "words": []}
                                 for start, text in segments])})
    return identifier


class NotebookChatTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.book = notebooks.create("Cardiology")["id"]
        self.voice = _conversation(self.book, "Voice note", [(0, "My blood pressure this morning was 130 over 85.")])
        self.visit = _conversation(self.book, "Clinic visit", [(0, "Welcome back."),
                                                              (42000, "Keep the lisinopril dose at 10 milligrams.")])
        self.lab = pages.create("Lab report", self.book, "LDL cholesterol 160 milligrams per decilitre")["id"]
        other = notebooks.create("Dermatology")["id"]
        self.elsewhere = pages.create("Skin note", other, "Apply the cream twice daily")["id"]
        self.checked = ["conversation:" + self.voice, "conversation:" + self.visit]
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def ask(self, reply: str, source_ids=None, question="What did the doctor say about the lisinopril dose?"):
        turn = AsyncMock(return_value=(reply, "session"))
        with patch.object(agent_gateway, "turn", turn):
            response = self.client.post(f"/api/v1/notebooks/{self.book}/ask",
                                        json={"question": question, "source_ids": source_ids or self.checked})
        return response, (turn.await_args.args[0] if turn.await_args else None)

    def test_unchecked_and_other_notebook_sources_never_reach_the_prompt(self):
        ids = [*self.checked, "page:" + self.elsewhere]
        for limit in (notebook_chat.FULL_TEXT_CHARS, 10):
            with self.subTest(full_text_limit=limit), patch.object(notebook_chat, "FULL_TEXT_CHARS", limit):
                response, prompt = self.ask("The dose stays at 10 mg. [[source:1]]", ids)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("lisinopril", prompt)
                self.assertNotIn("LDL", prompt)
                self.assertNotIn("cream", prompt)
                self.assertEqual({item["source_id"] for item in notebook_chat.retrieve(self.book, ids, "lisinopril dose")}
                                 - set(self.checked), set())

    def test_citations_are_renumbered_and_open_the_transcript_at_the_cited_time(self):
        passages = notebook_chat.retrieve(self.book, self.checked, "dose")
        dose = next(index for index, item in enumerate(passages, 1) if "lisinopril" in str(item["text"]))
        voice = next(index for index, item in enumerate(passages, 1) if "130" in str(item["text"]))
        response, _ = self.ask(f"The dose stays at 10 mg. [[source:{dose}]] Your reading was 130/85. "
                               f"[[source:{voice}]], [[source:{dose}]]")
        body = response.json()
        self.assertEqual(body["content"], "The dose stays at 10 mg. [[1]] Your reading was 130/85. [[2]] [[1]]")
        self.assertEqual([item["n"] for item in body["citations"]], [1, 2])
        first = body["citations"][0]
        self.assertEqual(first["source_id"], "conversation:" + self.visit)
        self.assertEqual(first["target"], f"/conversation/{self.visit}?at=seg-0&t=0")
        self.assertIn("lisinopril", first["excerpt"])

    def test_ranking_keeps_the_matching_chunk_and_its_timestamp(self):
        long_text = "Routine small talk about the weather. " * 30
        visit = _conversation(self.book, "Long visit", [(0, long_text), (90000, long_text),
                                                        (180000, "The cardiologist ordered an echocardiogram.")])
        with patch.object(notebook_chat, "FULL_TEXT_CHARS", 500):
            passages = notebook_chat.retrieve(self.book, ["conversation:" + visit], "When is the echocardiogram?")
        self.assertEqual(passages[0]["start_ms"], 180000)
        self.assertTrue(str(passages[0]["target"]).endswith("&t=180000"))

    def test_messages_are_stored_per_notebook(self):
        self.ask("The dose stays at 10 mg. [[source:1]]")
        stored = self.client.get(f"/api/v1/notebooks/{self.book}/chat").json()["messages"]
        self.assertEqual([item["role"] for item in stored], ["user", "assistant"])
        self.assertEqual(stored[1]["citations"][0]["n"], 1)
        self.assertEqual(self.client.get("/api/v1/notebooks/missing/chat").status_code, 404)

    def test_an_agent_reads_only_the_checked_passages_and_joins_the_notebook_history(self):
        from stellis import agent_runtime, agents
        visit = notebook_chat.retrieve(self.book, self.checked, "dose")
        target = next(item["target"] for item in visit if "lisinopril" in str(item["text"]))
        runtime = AsyncMock(return_value={"agent_message": {"content": f"The dose stays at 10 mg. [Clinic visit]({target})"}})
        with patch.object(agents, "require_enabled", return_value={"id": "agent-1", "name": "Heart helper"}), \
                patch.object(agent_runtime, "ask", runtime):
            response = self.client.post(f"/api/v1/notebooks/{self.book}/ask", json={
                "question": "What dose?", "source_ids": self.checked, "agent_id": "agent-1"})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual((body["author"], body["content"]), ("Heart helper", "The dose stays at 10 mg. [[1]]"))
        self.assertEqual(body["citations"][0]["target"], target)
        supplied = runtime.await_args.args[3]
        self.assertTrue(runtime.await_args.kwargs["only_supplied_sources"])
        self.assertEqual({item["source_id"] for item in supplied}, set(self.checked))
        self.assertEqual(self.client.get(f"/api/v1/notebooks/{self.book}/chat").json()["messages"][1]["agent_id"], "agent-1")

    def test_refusals(self):
        for reply in ("See [this](/conversation/x). [[source:1]]", "Answer. [[source:9]]", "Answer. [[source 1]]"):
            with self.subTest(reply=reply):
                response, _ = self.ask(reply)
                self.assertEqual(response.status_code, 503)
        response, prompt = self.ask("unused", ["page:" + self.elsewhere])
        self.assertEqual((response.status_code, prompt), (400, None))
        with patch.object(agent_gateway, "turn", AsyncMock(side_effect=agent_gateway.GatewayError("Allowance used"))):
            response = self.client.post(f"/api/v1/notebooks/{self.book}/ask",
                                        json={"question": "Dose?", "source_ids": self.checked})
        self.assertEqual((response.status_code, response.json()["detail"]), (503, "Allowance used"))
        self.assertEqual(self.client.get(f"/api/v1/notebooks/{self.book}/chat").json()["messages"], [])


if __name__ == "__main__":
    unittest.main()
