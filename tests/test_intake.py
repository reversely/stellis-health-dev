"""The intake call: notes, replies, notebook proposals and the voice call.

The agent model is replaced by the written Denver script in
tests/fixtures/intake_denver.json. The voice test speaks Denver's lines with
the call's own TTS and sends them through VAD and speech-to-text over the
WebSocket; it runs when STELLIS_CALL_MODELS names a folder with the models.
"""
import asyncio
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from stellis import intake, intake_voice, onboarding, pages, sorting, auth, notebooks

SCRIPT = json.loads((Path(__file__).parent / "fixtures" / "intake_denver.json").read_text())


def script_notes(index):
    """The notepad the script expects after Denver's answer number ``index``."""
    for turn in reversed(SCRIPT["turns"][:index + 1]):
        if turn["notes"] != "same":
            return turn["notes"]
    return []


class ScriptedModel:
    """Plays the agent and the note taker from the script."""

    def __init__(self):
        self.notes_calls = 0

    async def stream_tokens(self, messages):
        answered = sum(m["role"] == "user" for m in messages)
        for word in re.findall(r"\S+\s*", SCRIPT["turns"][answered]["agent"]):
            yield word

    async def complete_json(self, instructions, context, schema, max_tokens):
        if "notebooks" in instructions:
            records = context["records"]
            groups = []
            for book in SCRIPT["notebooks"]:
                items = [r["index"] for r in records if any(w in r["title"] for w in book["records"])]
                groups.append({"notebook": book["notebook"], "reason": "From the call", "goal": book["goal"],
                               "items": items})
            return {"groups": groups}
        self.notes_calls += 1
        answered = context["transcript"].count("Person:")
        return {"sections": script_notes(answered - 1)}


class IntakeTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        env = {"STELLIS_DATA_DIR": self.tmp.name, "STELLIS_AUTH_DB_DIR": self.tmp.name}
        if os.environ.get("STELLIS_CALL_MODELS"):
            env["STELLIS_CALL_MODELS"] = os.environ["STELLIS_CALL_MODELS"]
        self.env = patch.dict(os.environ, env, clear=True)
        self.env.start()
        self.model = ScriptedModel()
        self.patches = [patch.object(intake, "stream_tokens", self.model.stream_tokens),
                        patch.object(intake, "complete_json", self.model.complete_json)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in self.patches:
            item.stop()
        self.env.stop()
        self.tmp.cleanup()


class NotesTest(IntakeTestCase):
    def test_notes_keep_known_headings_in_order_without_repeats(self):
        notes = intake.clean_notes([
            {"heading": "Medicines", "items": ["- Metformin 500 mg", "Metformin 500 mg", " "]},
            {"heading": "Invented", "items": ["x"]},
            {"heading": "Goals", "items": ["Knees"]},
        ])
        self.assertEqual(notes, [{"heading": "Goals", "items": ["Knees"]},
                                 {"heading": "Medicines", "items": ["Metformin 500 mg"]}])

    def test_an_edit_against_an_old_revision_is_refused(self):
        intake.save_notes([{"heading": "Goals", "items": ["Walk daily"]}], 0)
        with self.assertRaises(ValueError):
            intake.save_notes([{"heading": "Goals", "items": ["Run"]}], 0)
        self.assertEqual(intake.load()["notes"][0]["items"], ["Walk daily"])

    def test_the_saved_note_puts_notes_before_the_transcript(self):
        intake.opening()
        intake.add_person_turn("Keeping the weight off")
        intake.save_notes([{"heading": "Goals", "items": ["Keep the weight off"]}], 0)
        state = intake.end()
        markdown = pages.get(state["page_id"])["markdown"]
        self.assertLess(markdown.index("## Goals"), markdown.index("## Transcript"))
        self.assertIn("**You:** Keeping the weight off", markdown)
        self.assertEqual(intake.end()["page_id"], state["page_id"])


class ReplyTest(IntakeTestCase):
    def test_the_first_clause_is_spoken_before_the_sentence_ends(self):
        intake.opening()
        intake.add_person_turn("Keeping the weight off, and my knees.")
        pieces = asyncio.run(self._collect())
        self.assertEqual(pieces, ["Eight kilos is real progress.",
                                  "Which knee is it, and how bad is the pain on the stairs now?"])
        timings = {}
        asyncio.run(self._collect(timings))
        self.assertIn("first_token", timings)

    async def _collect(self, timings=None):
        return [piece async for piece in intake.reply(timings)]

    def test_a_title_before_a_name_does_not_end_a_sentence(self):
        async def tokens(messages):
            yield "You see Dr. Patel and a dietitian. Is that right?"
        with patch.object(intake, "stream_tokens", tokens):
            pieces = asyncio.run(self._collect())
        self.assertEqual(pieces, ["You see Dr. Patel and a dietitian.", "Is that right?"])

    def test_a_long_first_clause_is_split_at_its_comma(self):
        async def tokens(messages):
            for word in "You have been working on this for a while, then. Good.".split(" "):
                yield word + " "
        with patch.object(intake, "stream_tokens", tokens):
            pieces = asyncio.run(self._collect())
        self.assertEqual(pieces, ["You have been working on this for a while,", "then.", "Good."])

    def test_a_typed_call_follows_the_script_and_ends(self):
        intake.opening()
        for index, turn in enumerate(SCRIPT["turns"]):
            if turn["person"] is None:
                break
            result = asyncio.run(intake.run_text_turn(turn["person"]))
            self.assertEqual(result["reply"], SCRIPT["turns"][index + 1]["agent"].replace(" [END]", ""))
        self.assertTrue(result["ended"])
        self.assertEqual(intake.load()["notes"], intake.clean_notes(script_notes(len(SCRIPT["turns"]) - 1)))


class NoteRulesTest(IntakeTestCase):
    def test_the_note_taker_gets_the_topics_and_drops_off_topic_words(self):
        seen = {}

        async def notes(instructions, context, schema, max_tokens):
            seen.update(instructions=instructions, context=context)
            return {"sections": []}
        intake.opening()
        intake.add_person_turn("Feel the end. The chestnut.")
        with patch.object(intake, "complete_json", notes):
            asyncio.run(intake.update_notes())
        self.assertEqual([t["heading"] for t in seen["context"]["topics"]],
                         [heading for heading, _ in intake.PLAN])
        self.assertIn("never guess what was meant", seen["instructions"])
        self.assertIn("didn't catch that", intake.INSTRUCTIONS)


class FollowOnTest(IntakeTestCase):
    def test_an_answer_continued_over_the_reply_joins_its_first_part(self):
        intake.opening()
        intake.add_person_turn("Type two diabetes and high blood pressure.")
        intake.add_agent_turn("Thank you. What medicines do you take?")
        intake.drop_agent_reply()
        whole = intake.extend_person_turn("And I had bypass surgery in ninety seven.")
        turns = intake.load()["turns"]
        self.assertEqual([t["role"] for t in turns], ["agent", "person"])
        self.assertTrue(whole.endswith("bypass surgery in ninety seven."))


class PlanTest(IntakeTestCase):
    def test_the_plan_starts_with_the_goal_and_moves_on_as_notes_fill(self):
        self.assertEqual(intake.plan(intake.load())["next_topic"], "Goals")
        intake.save_notes([{"heading": "Goals", "items": ["Keep the weight off"]},
                           {"heading": "Medicines", "items": ["Metformin"]}], 0)
        state = intake.load()
        self.assertEqual(intake.plan(state)["next_topic"], "Conditions")
        self.assertIn('"next_topic": "Conditions"', intake.conversation(state)[0]["content"])
        intake.save_notes([{"heading": heading, "items": ["x"]} for heading, _ in intake.PLAN], 1)
        self.assertEqual(intake.plan(intake.load())["next_topic"], "read back and end")

    def test_the_opening_states_the_purpose_and_asks_for_the_goal(self):
        self.assertIn("five minutes", intake.OPENING)
        self.assertTrue(intake.OPENING.endswith("what's the main health goal you'd like help with?"))


class NotebookProposalTest(IntakeTestCase):
    def test_notebooks_come_from_the_call_with_goals_and_empty_records(self):
        intake.save_notes(script_notes(6), 0)
        result = asyncio.run(intake.propose_notebooks())
        self.assertEqual([g["notebook_name"] for g in result["groups"]],
                         ["Weight and knees", "Diabetes and heart care"])
        self.assertEqual(result["groups"][0]["goal"], "Keep the weight off")
        self.assertEqual(result["groups"][0]["items"], [])

    def test_a_goal_becomes_a_to_do_in_the_notebook(self):
        auth.register("denver", "correct horse battery staple")
        account = auth.account_id_for_username("denver")
        onboarding.choose(account, [], "review")
        onboarding.complete(account, record_groups=[
            {"notebook_name": "Weight and knees", "items": [], "agents": [], "goal": "Keep the weight off"}])
        book = next(b for b in notebooks.list_notebooks() if b["name"] == "Weight and knees")
        goals = next(p for p in pages.list_pages(book["id"]) if p["title"] == "Goals")
        # Saving a page gives each to-do an ID after its text.
        self.assertTrue(pages.get(goals["id"])["markdown"].startswith("- [ ] Keep the weight off"))

    def test_groups_without_records_are_dropped_unless_kept(self):
        items = [sorting.Item("document", "d1", "Lab results", "2026-04-02")]
        reply = json.dumps({"groups": [{"notebook": "Goals", "items": []},
                                       {"notebook": "Labs", "items": [1]}]})
        self.assertEqual([g["notebook_name"] for g in sorting.parse_groups(reply, items, {})], ["Labs"])
        self.assertEqual(len(sorting.parse_groups(reply, items, {}, keep_empty=True)), 2)


class EchoTest(unittest.TestCase):
    def test_the_agents_own_words_are_not_an_answer(self):
        spoken = "How much have you lost so far, and what has helped most?"
        self.assertTrue(intake_voice.is_echo("how much have you lost so far", spoken))
        self.assertFalse(intake_voice.is_echo("about eight kilos since April", spoken))


def word_overlap(heard, said):
    """The share of the script's words of 4 letters or more that were heard."""
    norm = lambda text: re.findall(r"[a-z']{4,}", text.lower())
    expected = norm(said)
    got = set(norm(heard))
    return sum(word in got for word in expected) / max(1, len(expected))


CALL_MODELS_READY = bool(os.environ.get("STELLIS_CALL_MODELS")) and not intake_voice.missing()


@unittest.skipUnless(CALL_MODELS_READY, "Set STELLIS_CALL_MODELS to a folder with the call models")
class VoiceCallTest(IntakeTestCase):
    """Denver's voice, made with the call's TTS, calls the real speech pipeline."""

    def setUp(self):
        super().setUp()
        from stellis import server
        self.client = TestClient(server.app)
        self.engine = intake_voice.Engine(intake_voice.directory())

    def denver_audio(self, text):
        pcm, rate = self.engine.speak(text, intake_voice.DENVER_VOICE)
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
        times = np.arange(0, len(samples) / rate, 1 / intake_voice.SAMPLE_RATE)
        resampled = np.interp(times, np.arange(len(samples)) / rate, samples)
        silence = np.zeros(intake_voice.SAMPLE_RATE, dtype=np.float32)
        return np.concatenate([silence[:4000], resampled, silence]).astype("<i2").tobytes()

    def until_listening(self, socket):
        """Reads messages until the agent finishes; returns them and its audio."""
        messages, audio = [], 0
        while True:
            message = socket.receive()
            if message.get("bytes") is not None:
                audio += len(message["bytes"])
                continue
            data = json.loads(message["text"])
            messages.append(data)
            if data["type"] == "say" and data["audio"]:
                socket.send_json({"type": "playing", "turn": data["turn"]})
            if data["type"] == "state" and data["state"] == "listening":
                # A caller waits for the agent to finish before answering.
                socket.send_json({"type": "played"})
                return messages, audio

    def test_denver_completes_the_scripted_call_by_voice(self):
        overlaps, transcripts = [], []
        with self.client.websocket_connect("/api/v1/intake/call") as socket:
            ready = socket.receive_json()
            self.assertTrue(ready["voice"])
            messages, audio = self.until_listening(socket)
            self.assertGreater(audio, 0)
            self.assertEqual(" ".join(m["text"] for m in messages if m["type"] == "say"),
                             SCRIPT["turns"][0]["agent"])
            for turn in SCRIPT["turns"]:
                if turn["person"] is None:
                    break
                pcm = self.denver_audio(turn["person"])
                for start in range(0, len(pcm), 640):
                    socket.send_bytes(pcm[start:start + 640])
                messages, _ = self.until_listening(socket)
                # A pause can split an answer; the last "heard" has all of it.
                heard = [m["text"] for m in messages if m["type"] == "heard"][-1]
                overlaps.append(word_overlap(heard, turn["person"]))
                transcripts.append(heard)
            ended = socket.receive_json()
            self.assertEqual(ended["type"], "ended")
        # Medicine names and spoken numbers miss most often.
        self.assertGreaterEqual(sum(overlaps) / len(overlaps), 0.75, overlaps)
        print("word overlap per answer", [round(o, 2) for o in overlaps])
        print("heard", transcripts)
        state = intake.load()
        self.assertEqual(sum(t["role"] == "person" for t in state["turns"]), len(SCRIPT["turns"]) - 1)
        self.assertEqual(state["notes"], intake.clean_notes(script_notes(len(SCRIPT["turns"]) - 1)))
        log = (Path(self.tmp.name) / "intake-latency.jsonl").read_text().splitlines()
        stages = [json.loads(line) for line in log]
        self.assertEqual(len(stages), len(SCRIPT["turns"]) - 1)
        self.assertTrue(all(set(s) == {"stt_done", "first_token", "first_audio", "playing"} for s in stages))
        print("stage times in ms after the end of speech", stages)


if __name__ == "__main__":
    unittest.main()
