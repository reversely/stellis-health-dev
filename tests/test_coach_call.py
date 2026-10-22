"""Tests for coach calls: the morning summary, tools, endings and the call socket."""

import asyncio
import os
import tempfile
import unittest
from unittest import mock

from fastapi import testclient

from stellis import coach_call
from stellis import goals
from stellis import intake
from stellis import server

TODAY = "2026-10-22"
WALK = {"activity": "walk", "amount": 30, "times_per_week": 4, "reminder": "07:00"}
METFORMIN = {"activity": "medicine", "medicine": "metformin", "dose_amount": 500,
             "dose_unit": "mg", "times_per_week": 7, "reminder": "20:00"}


class Model:
    """Replaces the streamed model reply with scripted rounds.

    Each round is a list of text pieces and tool calls ({name, arguments}).
    """

    def __init__(self, *rounds):
        self.rounds = list(rounds)
        self.sent = []

    async def stream_tokens(self, messages, tools=None):
        self.sent.append((messages, tools))
        for index, piece in enumerate(self.rounds.pop(0)):
            if isinstance(piece, dict):
                yield {"id": f"call_{len(self.sent)}_{index}", **piece}
            else:
                yield piece


class CoachCallTest(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)

    async def start(self, kind="morning", now="08:00"):
        await coach_call.begin(kind, TODAY, now, 0)
        return coach_call.opening()

    async def turn(self, text, model):
        coach_call.add_person_turn(text)
        with mock.patch.object(intake, "stream_tokens", model.stream_tokens):
            pieces = [piece async for piece in coach_call.reply()]
        coach_call.add_agent_turn(" ".join(p for p in pieces if isinstance(p, str)))
        return pieces

    async def test_the_morning_check_in_opens_with_the_day_from_data(self):
        goals.create(WALK)
        goals.create(METFORMIN)

        opening = await self.start()

        self.assertEqual(opening, (
            "Good morning, it's Stellis with your check-in. Connect your calendar in Settings, "
            "and I'll include your appointments. Your reminders are walk 30 minutes at 7 am and "
            "take 500 mg of metformin at 8 pm. How are you doing today?"))
        self.assertFalse(coach_call.morning_due(TODAY, "09:00"))

    async def test_a_call_the_person_starts_asks_how_to_help(self):
        self.assertEqual(await self.start("call", "19:30"),
                         "Good evening, it's Stellis. What can I help you with?")
        self.assertTrue(coach_call.morning_due(TODAY, "09:00"))

    async def test_appointments_are_read_in_local_time(self):
        events = [{"title": "Dr. Patel", "start": "2026-10-22T13:30:00Z", "end": ""}]
        with mock.patch.object(coach_call.calendar, "connections",
                               return_value=[{"provider": "google", "connected": True}]), \
                mock.patch.object(coach_call.calendar, "events", mock.AsyncMock(return_value=events)):
            await coach_call.begin("morning", TODAY, "08:00", -240)

        self.assertIn("You have 1 appointment today: Dr. Patel at 9:30 am.", coach_call.opening())

    def test_the_morning_check_in_is_offered_once_each_morning(self):
        self.assertFalse(coach_call.morning_due(TODAY, "04:59"))
        self.assertTrue(coach_call.morning_due(TODAY, "05:00"))
        self.assertFalse(coach_call.morning_due(TODAY, "12:00"))
        coach_call.answer_morning(TODAY, "declined")
        self.assertFalse(coach_call.morning_due(TODAY, "08:00"))
        self.assertTrue(coach_call.morning_due("2026-10-23", "08:00"))

    async def test_a_named_goal_fills_the_form_and_a_done_activity_is_logged(self):
        walk = goals.create(WALK)["id"]
        await self.start()
        model = Model(
            [{"name": "fill_goal", "arguments": {"activity": "stretch", "amount": 10,
                                                 "times_per_week": 3}},
             "I filled in a stretching goal on your home page. Add it with Add goal."],
            [{"name": "log_goal", "arguments": {"goal_id": walk}}],
            ["Nice work on that walk. Anything else?"])

        first = await self.turn("Add stretching ten minutes three times a week", model)
        second = await self.turn("I walked this morning", model)

        self.assertEqual(first[0]["action"], "fill_goal")
        self.assertEqual(first[0]["values"]["title"], "Stretch 10 minutes")
        self.assertEqual(second, [{"action": "logged", "goal_id": walk},
                                  "Nice work on that walk.", coach_call.ANYTHING_ELSE])
        self.assertTrue(goals.overview(TODAY, 0, "09:00")["goals"][0]["done_today"])
        # The second round, after a reply of only tool calls, reads their results.
        messages, tools = model.sent[-1]
        self.assertEqual(messages[-1]["role"], "tool")
        self.assertIn("Logged Walk 30 minutes", messages[-1]["content"])
        self.assertEqual(tools, [coach_call.END_CALL])
        # Later turns see each earlier tool call and its result.
        history = coach_call.conversation(coach_call.load())
        self.assertEqual([m["role"] for m in history[-4:]],
                         ["user", "assistant", "tool", "assistant"])

    async def test_stellis_says_goodbye_and_hangs_up_when_asked(self):
        await self.start("call", "10:00")

        pieces = await self.turn("No, that's all", Model([{"name": "end_call", "arguments": {}}]))

        self.assertEqual(pieces, ["Have a nice day.", coach_call.END_MARK])

    async def test_bad_tool_calls_do_nothing(self):
        await self.start("call", "10:00")
        model = Model([{"name": "log_goal", "arguments": {"goal_id": "nope"}},
                       {"name": "fill_goal", "arguments": {"activity": "steps"}},
                       {"name": "delete_everything", "arguments": {}}],
                      ["Sorry, I couldn't do that."])

        pieces = await self.turn("Log my steps", model)

        self.assertEqual(pieces, ["Sorry, I couldn't do that.", coach_call.ANYTHING_ELSE])
        results = [m["content"] for m in model.sent[-1][0] if m["role"] == "tool"]
        self.assertTrue(all(result.startswith("Not") for result in results), results)

    async def test_a_long_call_wraps_up_then_ends(self):
        await self.start("call", "10:00")
        for n in range(coach_call.MAX_ANSWERS):
            coach_call.add_person_turn(f"Question {n}")
            coach_call.add_agent_turn("An answer.")
        self.assertTrue('"wrap_up": true' in coach_call.conversation(coach_call.load())[0]["content"])

        pieces = await self.turn("One more", Model(["Here you go."]))

        self.assertEqual(pieces[-1], coach_call.END_MARK)


class CoachCallSocketTest(unittest.TestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
                                                   "STELLIS_CALL_MODELS": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)
        self.client = testclient.TestClient(server.app)
        self.addCleanup(self.client.close)

    def test_a_typed_call_sends_actions_and_ends(self):
        model = Model(
            [{"name": "fill_goal", "arguments": {"activity": "meditate", "amount": 10,
                                                 "times_per_week": 5}},
             "Done, it's on your home page."],
            ["Have a nice day.", {"name": "end_call", "arguments": {}}])
        path = f"/api/v1/coach/call?kind=call&today={TODAY}&now=10:00&utc_offset=0"
        with mock.patch.object(intake, "stream_tokens", model.stream_tokens), \
                self.client.websocket_connect(path) as socket:
            self.assertFalse(socket.receive_json()["voice"])
            messages = []
            for text in ("Meditate ten minutes on weekdays", "That's all"):
                socket.send_json({"type": "text", "text": text})
                while not messages or messages[-1]["type"] not in {"ended"}:
                    messages.append(socket.receive_json())
                    if messages[-1] == {"type": "state", "state": "listening"} and \
                            any(m["type"] == "heard" and m["text"] == text for m in messages):
                        break
            while messages[-1]["type"] != "ended":
                messages.append(socket.receive_json())

        actions = [m for m in messages if m["type"] == "action"]
        self.assertEqual(actions[0]["values"]["title"], "Meditate 10 minutes")
        latest = self.client.get("/api/v1/coach", params={"today": TODAY, "now": "10:30"}).json()
        self.assertTrue(latest["latest"]["ended_at"])
        self.assertEqual(latest["latest"]["turns"][-1]["text"], "Have a nice day.")
        self.assertEqual(self.client.post("/api/v1/coach/morning",
                                          json={"day": TODAY, "answer": "declined"}).status_code, 200)

    def test_an_unknown_kind_is_refused(self):
        with self.assertRaises(Exception):
            with self.client.websocket_connect("/api/v1/coach/call?kind=sales&today=x") as socket:
                socket.receive_json()


if __name__ == "__main__":
    unittest.main()
