"""Goals a person builds from selectors, with weekly progress and reminders.

Each goal names an activity from ``ACTIVITIES``, an amount where that
activity has one, how many days a week, and an optional reminder time. A day
counts toward a goal when the person logs it, or, for an activity tied to a
measure, when they log a matching reading that day. A reminder asks "Did you
... yet?" from its time each day until the person logs the activity or meets
their weekly goal; "Not yet" keeps a reminder banner up for the rest of that
day. Days are the person's local days, so every read takes their UTC offset.
"""

from __future__ import annotations

import dataclasses
import datetime
import re
import uuid

from stellis import readings
from stellis import storage

MAX_GOALS = 12
MAX_NAME = 40
MAX_DOSE = 30
WEEK_DAYS = 7
HISTORY_WEEKS = 6
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


@dataclasses.dataclass(frozen=True)
class Activity:
    """One activity a goal can name.

    Attributes:
        key: Activity ID.
        label: Name in the Activity selector.
        amounts: Amount choices, in ``unit``; empty when an activity has none.
        unit: Unit of each amount: "minutes" or "hours".
        noun: Singular and plural name of one logged day, such as "walk".
        action: Words after "Did you" in a reminder, such as "go for your
            walk".
        measure: Readings measure whose readings also count, or None.
    """
    key: str
    label: str
    amounts: tuple[float, ...]
    unit: str
    noun: tuple[str, str]
    action: str
    measure: str | None = None


ACTIVITIES = {
    activity.key: activity for activity in (
        Activity("walk", "Walk", (10, 15, 20, 30, 45, 60), "minutes",
                 ("walk", "walks"), "go for your walk"),
        Activity("exercise", "Exercise", (15, 20, 30, 45, 60), "minutes",
                 ("workout", "workouts"), "exercise"),
        Activity("stretch", "Stretch", (5, 10, 15, 20), "minutes",
                 ("stretch", "stretches"), "stretch"),
        Activity("meditate", "Meditate", (5, 10, 15, 20), "minutes",
                 ("session", "sessions"), "meditate"),
        Activity("medicine", "Take a medicine", (), "", ("dose", "doses"),
                 "take"),
        Activity("blood_pressure", "Check blood pressure", (), "",
                 ("reading", "readings"), "check your blood pressure",
                 "blood_pressure"),
        Activity("pulse", "Check pulse with camera", (), "",
                 ("check", "checks"), "check your pulse", "pulse"),
        Activity("sleep", "Sleep", (6, 6.5, 7, 7.5, 8, 8.5, 9), "hours",
                 ("night", "nights"), "log last night's sleep", "sleep"),
    )
}


def _create_tables(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS coach_goals (
            id TEXT PRIMARY KEY,
            activity TEXT NOT NULL,
            amount REAL,
            medicine TEXT NOT NULL DEFAULT '',
            dose TEXT NOT NULL DEFAULT '',
            times_per_week INTEGER NOT NULL,
            reminder TEXT,
            created_at TEXT NOT NULL)""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS coach_goal_days (
            goal_id TEXT NOT NULL REFERENCES coach_goals(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            PRIMARY KEY (goal_id, day))""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS coach_reminders_pending (
            goal_id TEXT NOT NULL REFERENCES coach_goals(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            PRIMARY KEY (goal_id, day))""")


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def options() -> list[dict[str, object]]:
    """Lists each activity with its amount choices, for the selectors."""
    return [{"key": a.key, "label": a.label, "amounts": list(a.amounts),
             "unit": a.unit, "noun": list(a.noun), "measure": a.measure}
            for a in ACTIVITIES.values()]


def _clean(fields: dict[str, object]) -> tuple:
    """Checks a goal's selector values.

    Returns:
        Activity key, amount, medicine, dose, days a week and reminder.

    Raises:
        ValueError: A value is outside its selector's choices.
    """
    activity = ACTIVITIES.get(str(fields.get("activity") or ""))
    if activity is None:
        raise ValueError("Choose an activity from the list")
    amount = fields.get("amount")
    if activity.amounts:
        if amount is None or float(amount) not in activity.amounts:
            raise ValueError(f"Choose an amount for {activity.label.lower()}")
        amount = float(amount)
    else:
        amount = None
    medicine = " ".join(str(fields.get("medicine") or "").split())
    dose = " ".join(str(fields.get("dose") or "").split())
    if activity.key == "medicine":
        if not medicine:
            raise ValueError("Enter a medicine name")
        if len(medicine) > MAX_NAME or len(dose) > MAX_DOSE:
            raise ValueError(f"Keep a medicine name under {MAX_NAME} characters "
                             f"and a dose under {MAX_DOSE}")
    else:
        medicine = dose = ""
    times = fields.get("times_per_week")
    if not isinstance(times, int) or not 1 <= times <= WEEK_DAYS:
        raise ValueError("Choose 1 to 7 times a week")
    reminder = fields.get("reminder") or None
    if reminder is not None and not _TIME.match(str(reminder)):
        raise ValueError("Choose a reminder time")
    return activity.key, amount, medicine, dose, times, reminder


def create(fields: dict[str, object]) -> dict[str, str]:
    """Adds a goal from selector values.

    Args:
        fields: ``activity``, ``amount``, ``medicine``, ``dose``,
            ``times_per_week`` and ``reminder`` ("HH:MM" or None).

    Returns:
        New goal's ``id``.

    Raises:
        ValueError: A value is invalid, or a person already has MAX_GOALS.
    """
    values = _clean(fields)
    goal_id = str(uuid.uuid4())
    with storage.connect() as conn:
        _create_tables(conn)
        count = conn.execute("SELECT COUNT(*) FROM coach_goals").fetchone()[0]
        if count >= MAX_GOALS:
            raise ValueError(f"Keep at most {MAX_GOALS} goals")
        conn.execute("INSERT INTO coach_goals VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (goal_id, *values, _now().isoformat(timespec="seconds")))
    return {"id": goal_id}


def update(goal_id: str, fields: dict[str, object]) -> None:
    """Replaces a goal's selector values.

    Raises:
        LookupError: No goal has ``goal_id``.
        ValueError: A value is invalid.
    """
    values = _clean(fields)
    with storage.connect() as conn:
        _create_tables(conn)
        changed = conn.execute(
            "UPDATE coach_goals SET activity = ?, amount = ?, medicine = ?, "
            "dose = ?, times_per_week = ?, reminder = ? WHERE id = ?",
            (*values, goal_id)).rowcount
    if not changed:
        raise LookupError("Goal not found")


def delete(goal_id: str) -> None:
    """Deletes a goal and its logged days; readings stay.

    Raises:
        LookupError: No goal has ``goal_id``.
    """
    with storage.connect() as conn:
        _create_tables(conn)
        if not conn.execute("DELETE FROM coach_goals WHERE id = ?",
                            (goal_id,)).rowcount:
            raise LookupError("Goal not found")


def _require(conn, goal_id: str) -> None:
    _create_tables(conn)
    if not conn.execute("SELECT 1 FROM coach_goals WHERE id = ?",
                        (goal_id,)).fetchone():
        raise LookupError("Goal not found")


def _day(text: str) -> str:
    try:
        day = datetime.date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("Send a date as YYYY-MM-DD") from exc
    if day > _now().date() + datetime.timedelta(days=1):
        raise ValueError("A log cannot be in the future")
    return day.isoformat()


def mark(goal_id: str, day: str, done: bool) -> None:
    """Logs or clears a goal's activity on a day.

    Raises:
        LookupError: No goal has ``goal_id``.
        ValueError: ``day`` is not a date or is in the future.
    """
    day = _day(day)
    with storage.connect() as conn:
        _require(conn, goal_id)
        conn.execute("DELETE FROM coach_goal_days WHERE goal_id = ? AND day = ?",
                     (goal_id, day))
        if done:
            conn.execute("INSERT INTO coach_goal_days VALUES (?, ?)",
                         (goal_id, day))


def not_yet(goal_id: str, day: str) -> None:
    """Records "Not yet" on a reminder, so its banner stays up all day.

    Raises:
        LookupError: No goal has ``goal_id``.
        ValueError: ``day`` is not a date or is in the future.
    """
    day = _day(day)
    with storage.connect() as conn:
        _require(conn, goal_id)
        conn.execute("INSERT OR IGNORE INTO coach_reminders_pending "
                     "VALUES (?, ?)", (goal_id, day))


def _local_day(time: str, offset: datetime.timedelta) -> datetime.date:
    """Local date of an ISO time; a bare date is already local."""
    if len(time) <= 10:
        return datetime.date.fromisoformat(time)
    moment = datetime.datetime.fromisoformat(time)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    return (moment.astimezone(datetime.timezone.utc) + offset).date()


def title(activity: Activity, amount: float | None, medicine: str,
          dose: str) -> str:
    """Names a goal from its selectors, such as "Walk 30 minutes"."""
    if activity.key == "medicine":
        return " ".join(part for part in ("Take", medicine, dose) if part)
    if activity.key == "sleep":
        return f"Sleep at least {amount:g} hours"
    if amount is not None:
        return f"{activity.label} {amount:g} {activity.unit}"
    return activity.label


def overview(today: str, utc_offset: int, now: str) -> dict[str, object]:
    """Lists goals with their progress, and reminders due now.

    Args:
        today: Person's local date, as YYYY-MM-DD.
        utc_offset: Person's offset from UTC in minutes, east positive.
        now: Person's local time, as HH:MM.

    Returns:
        ``goals``, oldest first, each with its selector values, ``title``,
        ``noun``, ``this_week`` (days logged since Monday), ``done_today``
        and ``weeks`` (logged days in each of HISTORY_WEEKS weeks, oldest
        first, ending this week); ``reminders`` due now, each with
        ``goal_id``, ``question``, ``reminder`` and ``state`` ("ask" before
        an answer, "pending" after "Not yet"); and ``activities``.
    """
    day = datetime.date.fromisoformat(today)
    if abs(utc_offset) > 14 * 60:
        raise ValueError("Send a UTC offset within 14 hours")
    if not _TIME.match(now):
        raise ValueError("Send a time as HH:MM")
    offset = datetime.timedelta(minutes=utc_offset)
    monday = day - datetime.timedelta(days=day.weekday())
    first = monday - datetime.timedelta(weeks=HISTORY_WEEKS - 1)
    series = {item["key"]: item["points"] for item in readings.series()}
    with storage.connect() as conn:
        _create_tables(conn)
        rows = conn.execute(
            "SELECT * FROM coach_goals ORDER BY created_at, rowid").fetchall()
        logged = conn.execute(
            "SELECT goal_id, day FROM coach_goal_days WHERE day >= ?",
            (first.isoformat(),)).fetchall()
        pending = {(row["goal_id"], row["day"]) for row in conn.execute(
            "SELECT * FROM coach_reminders_pending WHERE day = ?",
            (day.isoformat(),))}
    goals, reminders = [], []
    for row in rows:
        activity = ACTIVITIES[row["activity"]]
        done = {datetime.date.fromisoformat(log["day"])
                for log in logged if log["goal_id"] == row["id"]}
        for point in series.get(activity.measure, []) if activity.measure else []:
            if activity.key == "pulse" and point["source"] != "camera":
                continue
            if activity.key == "sleep" and float(point["value"]) < row["amount"]:
                continue
            done.add(_local_day(str(point["time"]), offset))
        weeks = [sum(1 for n in range(WEEK_DAYS) if start + datetime.timedelta(
            days=n) in done) for start in (
                first + datetime.timedelta(weeks=w)
                for w in range(HISTORY_WEEKS))]
        name = title(activity, row["amount"], row["medicine"], row["dose"])
        goal = {
            "id": row["id"], "activity": activity.key, "amount": row["amount"],
            "medicine": row["medicine"], "dose": row["dose"],
            "times_per_week": row["times_per_week"],
            "reminder": row["reminder"], "title": name,
            "noun": list(activity.noun), "measure": activity.measure,
            "this_week": weeks[-1], "done_today": day in done,
            "weeks": weeks,
        }
        goals.append(goal)
        due = (row["reminder"] and now >= row["reminder"]
               and not goal["done_today"]
               and goal["this_week"] < row["times_per_week"])
        if due:
            action = (f"take {row['medicine']} {row['dose']}".strip()
                      if activity.key == "medicine" else activity.action)
            reminders.append({
                "goal_id": row["id"], "question": f"Did you {action} yet?",
                "title": name, "reminder": row["reminder"],
                "state": "pending" if (row["id"], day.isoformat()) in pending
                         else "ask"})
    return {"goals": goals, "reminders": reminders, "activities": options()}
