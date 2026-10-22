"""Tests for goals, trackers, streaks and timers."""

import datetime
import os
import tempfile
import unittest
from unittest import mock

from fastapi import testclient

from stellis import goals
from stellis import readings
from stellis import server

TODAY = "2026-10-22"  # A Thursday.


def _goal(result: dict[str, object], goal_id: str) -> dict[str, object]:
    return next(goal for goal in result["goals"] if goal["id"] == goal_id)


class GoalsTest(unittest.TestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ,
                                      {"STELLIS_DATA_DIR": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)

    def tracker(self, goal_id: str, today: str = TODAY,
                offset: int = 0) -> dict[str, object]:
        return _goal(goals.overview(today, offset), goal_id)["trackers"][0]

    def test_daily_steps_sum_each_local_day_into_a_streak(self):
        goal = goals.create("Walk more", trackers=[
            {"kind": "daily", "measure": "steps", "target": 7000}],
            today="2026-10-19")
        for time, steps in (("2026-10-19T12:00:00+00:00", 7200),
                            ("2026-10-20T09:00:00+00:00", 4000),
                            ("2026-10-20T18:00:00+00:00", 3500),
                            ("2026-10-21T12:00:00+00:00", 7000),
                            ("2026-10-22T08:00:00+00:00", 2000)):
            readings.add("steps", steps, taken_at=time)

        tracker = self.tracker(goal["id"])

        self.assertEqual(tracker["today"], 2000)
        self.assertFalse(tracker["met_today"])
        # Today is unmet, so the streak counts Oct 19 to 21.
        self.assertEqual(tracker["streak"], 3)
        self.assertEqual([day["met"] for day in tracker["days"][-4:]],
                         [True, True, True, False])
        self.assertEqual(tracker["days"][-3]["value"], 7500)
        self.assertFalse(tracker["days"][0]["tracked"])

    def test_a_reading_late_in_the_evening_counts_on_the_local_day(self):
        goal = goals.create("Water", trackers=[
            {"kind": "daily", "measure": "water", "target": 2}],
            today="2026-10-21")
        # 23:30 on Oct 21 in New York (UTC-4) is Oct 22 in UTC.
        readings.add("water", 2, taken_at="2026-10-22T03:30:00+00:00")

        tracker = self.tracker(goal["id"], "2026-10-21", offset=-240)

        self.assertEqual(tracker["today"], 2)
        self.assertTrue(tracker["met_today"])

    def test_an_at_most_target_counts_days_with_nothing_logged(self):
        goal = goals.create("Fewer drinks", trackers=[
            {"kind": "daily", "measure": "drinks", "target": 1,
             "direction": "at_most"}], today="2026-10-20")
        readings.add("drinks", 3, taken_at="2026-10-21T20:00:00+00:00")

        tracker = self.tracker(goal["id"])

        self.assertTrue(tracker["met_today"])
        self.assertEqual(tracker["streak"], 1)

    def test_weekly_habit_counts_marked_days_and_whole_weeks(self):
        goal = goals.create("Exercise", trackers=[
            {"kind": "weekly", "label": "Exercise", "target": 2}],
            today="2026-10-12")
        tracker_id = self.tracker(goal["id"])["id"]
        for day in ("2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22"):
            goals.mark(tracker_id, day, True)

        tracker = self.tracker(goal["id"])

        self.assertEqual(tracker["this_week"], 2)
        self.assertEqual(tracker["streak"], 2)
        self.assertEqual(len(tracker["days"]), 7)
        self.assertEqual(tracker["days"][0]["date"], "2026-10-19")

        goals.mark(tracker_id, "2026-10-22", False)
        tracker = self.tracker(goal["id"])
        self.assertEqual(tracker["this_week"], 1)
        # This week is short, so the streak keeps last week's count.
        self.assertEqual(tracker["streak"], 1)

    def test_a_habit_tied_to_a_measure_counts_days_with_a_reading(self):
        goal = goals.from_template("blood_pressure", today="2026-10-19")
        readings.add("blood_pressure", 128, 82,
                     taken_at="2026-10-20T08:00:00+00:00")

        tracker = self.tracker(goal["id"])

        self.assertTrue(tracker["from_readings"])
        self.assertEqual(tracker["this_week"], 1)

    def test_timer_logs_minutes_on_the_day_it_started(self):
        goal = goals.create("Fast", trackers=[
            {"kind": "timer", "label": "Fasting", "target": 840}],
            today="2026-10-21")
        tracker_id = self.tracker(goal["id"])["id"]
        start = datetime.datetime(2026, 10, 21, 20, tzinfo=datetime.timezone.utc)
        with mock.patch.object(goals, "_now", return_value=start):
            goals.start_timer(tracker_id)
        with self.assertRaisesRegex(ValueError, "already running"):
            goals.start_timer(tracker_id)
        self.assertEqual(self.tracker(goal["id"])["running_since"],
                         "2026-10-21T20:00:00+00:00")
        with mock.patch.object(goals, "_now",
                               return_value=start + datetime.timedelta(hours=15)):
            self.assertEqual(goals.stop_timer(tracker_id, 0), {"minutes": 900})

        tracker = self.tracker(goal["id"])

        self.assertIsNone(tracker["running_since"])
        self.assertEqual(tracker["days"][-2]["value"], 900)
        self.assertEqual(tracker["streak"], 1)

    def test_days_without_count_from_the_last_slip(self):
        goal = goals.from_template("smoking", today="2026-10-10")
        tracker_id = self.tracker(goal["id"])["id"]
        self.assertEqual(self.tracker(goal["id"])["streak"], 13)

        goals.mark(tracker_id, "2026-10-18", True)

        tracker = self.tracker(goal["id"])
        self.assertEqual(tracker["streak"], 4)
        self.assertEqual(tracker["last_slip"], "2026-10-18")

    def test_target_progress_runs_from_the_starting_reading(self):
        readings.add("weight", 90, taken_at="2026-09-01T08:00:00+00:00")
        goal = goals.from_template("weight", targets={0: 85},
                                   today="2026-09-02")
        readings.add("weight", 88, taken_at="2026-10-20T08:00:00+00:00")

        tracker = self.tracker(goal["id"])

        self.assertEqual(tracker["baseline"], 90)
        self.assertEqual(tracker["latest"], 88)
        self.assertAlmostEqual(tracker["fraction"], 0.4)

    def test_a_template_skips_a_target_the_person_left_blank(self):
        goal = goals.from_template("weight", today=TODAY)

        trackers = _goal(goals.overview(TODAY, 0), goal["id"])["trackers"]

        self.assertEqual([t["label"] for t in trackers], ["Weigh in"])

    def test_invalid_trackers_are_refused(self):
        for tracker, message in (
            ({"kind": "daily", "measure": "steps"}, "target"),
            ({"kind": "daily", "measure": "blood_pressure", "target": 120},
             "habit"),
            ({"kind": "weekly", "label": "Walk", "target": 8}, "1 to 7"),
            ({"kind": "laps", "label": "Swim", "target": 1}, "kind"),
        ):
            with self.subTest(tracker=tracker):
                with self.assertRaisesRegex(ValueError, message):
                    goals.create("Goal", trackers=[tracker])

    def test_goal_words_suggest_templates(self):
        self.assertEqual(goals.suggest("Keep the weight off, and my knees"),
                         ["move", "weight"])
        self.assertEqual(goals.suggest("Lower my blood pressure"),
                         ["blood_pressure"])
        self.assertEqual(goals.suggest("Feel less anxious"), ["unwind"])
        self.assertEqual(goals.suggest("Understand my scan"), [])


class GoalsApiTest(unittest.TestCase):

    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = mock.patch.dict(os.environ,
                                      {"STELLIS_DATA_DIR": self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)
        self.client = testclient.TestClient(server.app)
        self.addCleanup(self.client.close)

    def test_a_goal_from_a_template_is_logged_and_deleted(self):
        templates = self.client.get("/api/v1/goals/templates").json()
        self.assertIn("water", [t["key"] for t in templates["templates"]])
        created = self.client.post("/api/v1/goals", json={
            "template": "water", "targets": {"0": 6}, "today": TODAY})
        self.assertEqual(created.status_code, 200, created.text)
        self.client.post("/api/v1/readings", json={"measure": "water",
                                                   "value": 6})

        listed = self.client.get("/api/v1/goals",
                                 params={"today": datetime.date.today()
                                         .isoformat()}).json()
        tracker = listed["goals"][0]["trackers"][0]
        self.assertEqual((tracker["target"], tracker["unit"]),
                         (6, "glasses"))
        self.assertTrue(tracker["met_today"])

        deleted = self.client.delete(f"/api/v1/goals/{created.json()['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/goals", params={
            "today": TODAY}).json(), {"goals": []})

    def test_a_custom_goal_with_a_bad_tracker_is_a_400(self):
        reply = self.client.post("/api/v1/goals", json={
            "title": "Swim", "trackers": [{"kind": "weekly", "target": 9,
                                          "label": "Swim"}]})

        self.assertEqual(reply.status_code, 400)
        self.assertIn("1 to 7", reply.json()["detail"])

    def test_habit_days_and_timers_round_trip(self):
        goal = self.client.post("/api/v1/goals", json={
            "title": "Calm", "trackers": [
                {"kind": "weekly", "label": "Stretch", "target": 3},
                {"kind": "timer", "label": "Meditation", "target": 10}]}).json()
        trackers = self.client.get("/api/v1/goals", params={
            "today": TODAY}).json()["goals"][0]["trackers"]
        habit, timer = trackers[0]["id"], trackers[1]["id"]

        self.assertEqual(self.client.put(f"/api/v1/trackers/{habit}/days",
                                         json={"day": TODAY, "done": True})
                         .status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/trackers/{timer}/timer")
                         .status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/trackers/{timer}/timer")
                         .status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/trackers/{timer}/timer")
                         .json(), {"minutes": 0})
        self.assertEqual(self.client.patch(f"/api/v1/trackers/{habit}",
                                           json={"target": 5}).status_code,
                         200)
        self.assertEqual(self.client.delete(f"/api/v1/trackers/{timer}")
                         .status_code, 200)
        self.assertEqual(self.client.delete("/api/v1/trackers/missing")
                         .status_code, 404)
        self.assertEqual(goal.keys(), {"id"})


if __name__ == "__main__":
    unittest.main()
