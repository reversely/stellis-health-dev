"""Goals the person sets, each measured by one or more trackers.

A tracker turns logs into progress. Five kinds exist:

- ``daily``: a daily target on a measure, such as 7,000 steps or at most
  2 drinks. Readings of the measure are its logs.
- ``target``: a value to reach on a measure, such as a weight of 85 kg,
  shown as progress from the starting reading.
- ``weekly``: a habit done N days a week. A day counts when the person marks
  it done or, for a habit tied to a measure, logs a reading that day.
- ``timer``: a timed activity, such as a 14-hour fast. A day counts when its
  timed minutes reach the target.
- ``without``: days since the person last logged a slip, such as smoking.

Days are the person's local days, so every read takes their UTC offset.
"""

from __future__ import annotations

import dataclasses
import datetime
import uuid

from stellis import readings
from stellis import storage

KINDS = ("daily", "target", "weekly", "timer", "without")
DIRECTIONS = ("at_least", "at_most")
MAX_TITLE = 80
MAX_LABEL = 40
MAX_GOALS = 12
MAX_TRACKERS = 4
MAX_TIMER_MINUTES = 48 * 60
MAX_OFFSET_MINUTES = 14 * 60
WEEK_DAYS = 7


@dataclasses.dataclass(frozen=True)
class Template:
    """A prepopulated goal.

    Attributes:
        key: The template's ID.
        title: The goal's title.
        words: Lower-case word starts that suggest the template for a goal
            the person wrote, such as "walk" for "walk more".
        trackers: Tracker settings, as ``add_tracker`` takes them. A target
            of None asks the person for one, for example a weight.
    """
    key: str
    title: str
    words: tuple[str, ...]
    trackers: tuple[dict[str, object], ...]


# Targets are everyday wellness defaults the person can change; clinical
# targets, such as a blood pressure, come from the person's clinician.
TEMPLATES = (
    Template("move", "Move more", ("move", "walk", "step", "exercis", "active",
                                   "fitness", "knee"),
             ({"kind": "daily", "measure": "steps", "target": 7000},
              {"kind": "weekly", "label": "Exercise", "target": 3})),
    Template("sleep", "Sleep better", ("sleep", "tired", "insomnia", "rest"),
             ({"kind": "daily", "measure": "sleep", "target": 7},)),
    Template("water", "Drink more water", ("water", "hydrat"),
             ({"kind": "daily", "measure": "water", "target": 8},)),
    Template("weight", "Manage my weight", ("weight", "lose", "diet", "kg",
                                            "pound"),
             ({"kind": "target", "measure": "weight", "target": None},
              {"kind": "weekly", "label": "Weigh in", "measure": "weight",
               "target": 1})),
    Template("blood_pressure", "Keep my blood pressure in check",
             ("blood pressure", "hypertension", "bp"),
             ({"kind": "weekly", "label": "Check blood pressure",
               "measure": "blood_pressure", "target": 3},)),
    Template("medicines", "Take my medicines on time",
             ("medic", "pill", "dose", "prescri", "tablet"),
             ({"kind": "weekly", "label": "Take medicines", "target": 7},)),
    Template("alcohol", "Cut down on alcohol",
             ("alcohol", "drink", "beer", "wine"),
             ({"kind": "weekly", "label": "Alcohol-free day", "target": 4},)),
    Template("smoking", "Stop smoking",
             ("smok", "cigarette", "vap", "nicotine"),
             ({"kind": "without", "label": "Smoking"},)),
    Template("pulse", "Check my resting pulse",
             ("pulse", "heart rate", "heart"),
             ({"kind": "weekly", "label": "Resting pulse", "measure": "pulse",
               "target": 7},)),
    Template("fasting", "Keep a fasting window", ("fast", "intermittent"),
             ({"kind": "timer", "label": "Fasting", "target": 14 * 60},)),
    Template("unwind", "Take time to unwind",
             ("stress", "anxi", "calm", "meditat", "mindful", "relax"),
             ({"kind": "timer", "label": "Meditation", "target": 10},)),
)
_TEMPLATES = {template.key: template for template in TEMPLATES}


def _create_tables(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            notebook_id TEXT,
            template TEXT,
            created_at TEXT NOT NULL)""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS goal_trackers (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            measure TEXT,
            target REAL,
            direction TEXT NOT NULL DEFAULT 'at_least',
            started_on TEXT NOT NULL,
            timer_started_at TEXT,
            created_at TEXT NOT NULL)""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS goal_logs (
            id TEXT PRIMARY KEY,
            tracker_id TEXT NOT NULL
                REFERENCES goal_trackers(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            value REAL NOT NULL,
            created_at TEXT NOT NULL)""")


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _stamp(moment: datetime.datetime | None = None) -> str:
    return (moment or _now()).isoformat(timespec="seconds")


def _offset(minutes: int) -> datetime.timedelta:
    """The person's UTC offset, as JavaScript's getTimezoneOffset negated."""
    if abs(minutes) > MAX_OFFSET_MINUTES:
        raise ValueError("Send a UTC offset within 14 hours")
    return datetime.timedelta(minutes=minutes)


def _local_day(time: str, offset: datetime.timedelta) -> datetime.date:
    """The local date of an ISO time; a bare date is already local."""
    if len(time) <= 10:
        return datetime.date.fromisoformat(time)
    moment = datetime.datetime.fromisoformat(time)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    return (moment.astimezone(datetime.timezone.utc) + offset).date()


def _clean_text(text: str, limit: int, what: str) -> str:
    text = " ".join(str(text).split())
    if not text:
        raise ValueError(f"Enter a {what}")
    if len(text) > limit:
        raise ValueError(f"Keep the {what} under {limit} characters")
    return text


def suggest(text: str) -> list[str]:
    """Returns the keys of templates whose words appear in a goal's text."""
    folded = " " + " ".join(str(text).casefold().split())
    return [template.key for template in TEMPLATES
            if any(" " + word in folded for word in template.words)]


def templates() -> list[dict[str, object]]:
    """Lists the prepopulated goals with their trackers, for the picker."""
    return [{"key": t.key, "title": t.title,
             "trackers": [_describe(dict(tracker)) for tracker in t.trackers]}
            for t in TEMPLATES]


def _describe(tracker: dict[str, object]) -> dict[str, object]:
    """Fills a template tracker's label and unit for display."""
    measure = readings.MEASURES.get(str(tracker.get("measure") or ""))
    tracker.setdefault("label", measure.label if measure else "")
    tracker.setdefault("direction", "at_least")
    tracker["unit"] = _unit(str(tracker["kind"]), measure)
    return tracker


def _unit(kind: str, measure: readings.Measure | None) -> str:
    if kind in ("daily", "target") and measure:
        return measure.unit
    return {"weekly": "days a week", "timer": "min"}.get(kind, "")


def _check_tracker(kind: str, measure: str | None, target: float | None,
                   direction: str) -> None:
    if kind not in KINDS:
        raise ValueError("Choose a listed tracker kind")
    if direction not in DIRECTIONS:
        raise ValueError("Choose at least or at most")
    if kind in ("daily", "target"):
        if measure not in readings.MEASURES:
            raise ValueError("Choose a listed measure")
        if readings.MEASURES[measure].paired:
            raise ValueError("Track blood pressure as a habit")
        if target is None:
            raise ValueError("Enter a target")
        low, high = readings.MEASURES[measure].bounds
        if not min(low, 0) <= target <= high:
            raise ValueError(f"Enter a target between {min(low, 0):g} and "
                             f"{high:g}")
    elif measure is not None and measure not in readings.MEASURES:
        raise ValueError("Choose a listed measure")
    if kind == "weekly" and (target is None or not 1 <= target <= WEEK_DAYS):
        raise ValueError("Choose 1 to 7 days a week")
    if kind == "timer" and (target is None
                            or not 1 <= target <= MAX_TIMER_MINUTES):
        raise ValueError(f"Choose 1 to {MAX_TIMER_MINUTES} minutes")


def create(title: str,
           notebook_id: str | None = None,
           template: str | None = None,
           trackers: list[dict[str, object]] | None = None,
           today: str | None = None) -> dict[str, object]:
    """Creates a goal with its trackers.

    Args:
        title: The goal in the person's words.
        notebook_id: The notebook the goal belongs to, or None.
        template: The key of the template it came from, or None.
        trackers: Settings for ``add_tracker``.
        today: The person's local date, which starts every streak.

    Returns:
        The goal's ID.

    Raises:
        ValueError: A field is invalid, or the person has MAX_GOALS goals.
    """
    title = _clean_text(title, MAX_TITLE, "goal")
    if template is not None and template not in _TEMPLATES:
        raise ValueError("Choose a listed goal")
    trackers = trackers or []
    if len(trackers) > MAX_TRACKERS:
        raise ValueError(f"Add at most {MAX_TRACKERS} trackers to a goal")
    goal_id = str(uuid.uuid4())
    with storage.connect() as conn:
        _create_tables(conn)
        if conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] >= MAX_GOALS:
            raise ValueError(f"Keep at most {MAX_GOALS} goals")
        conn.execute("INSERT INTO goals VALUES (?, ?, ?, ?, ?)",
                     (goal_id, title, notebook_id, template, _stamp()))
        for item in trackers:
            _insert_tracker(conn, goal_id, item, today)
    return {"id": goal_id}


def _insert_tracker(conn, goal_id: str, item: dict[str, object],
                    today: str | None) -> str:
    kind = str(item.get("kind") or "")
    measure = item.get("measure") or None
    target = None if item.get("target") is None else float(item["target"])
    direction = str(item.get("direction") or "at_least")
    _check_tracker(kind, measure, target, direction)
    default = readings.MEASURES[measure].label if measure else ""
    label = _clean_text(item.get("label") or default, MAX_LABEL, "label")
    started = datetime.date.fromisoformat(today) if today else _now().date()
    tracker_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO goal_trackers (id, goal_id, kind, label, measure, target,"
        " direction, started_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tracker_id, goal_id, kind, label, measure, target, direction,
         started.isoformat(), _stamp()))
    return tracker_id


def add_tracker(goal_id: str, item: dict[str, object],
                today: str | None = None) -> dict[str, object]:
    """Adds a tracker to a goal.

    Raises:
        LookupError: The goal does not exist.
        ValueError: A field is invalid or the goal has MAX_TRACKERS trackers.
    """
    with storage.connect() as conn:
        _create_tables(conn)
        if not conn.execute("SELECT 1 FROM goals WHERE id = ?",
                            (goal_id,)).fetchone():
            raise LookupError("Goal not found")
        count = conn.execute("SELECT COUNT(*) FROM goal_trackers WHERE "
                             "goal_id = ?", (goal_id,)).fetchone()[0]
        if count >= MAX_TRACKERS:
            raise ValueError(f"Add at most {MAX_TRACKERS} trackers to a goal")
        return {"id": _insert_tracker(conn, goal_id, item, today)}


def update_tracker(tracker_id: str, target: float) -> None:
    """Changes a tracker's target.

    Raises:
        LookupError: The tracker does not exist.
        ValueError: The target is invalid for the tracker.
    """
    with storage.connect() as conn:
        row = _tracker_row(conn, tracker_id)
        _check_tracker(row["kind"], row["measure"], target, row["direction"])
        conn.execute("UPDATE goal_trackers SET target = ? WHERE id = ?",
                     (target, tracker_id))


def delete_goal(goal_id: str) -> None:
    """Deletes a goal, its trackers and their logs; readings stay.

    Raises:
        LookupError: The goal does not exist.
    """
    with storage.connect() as conn:
        _create_tables(conn)
        if not conn.execute("DELETE FROM goals WHERE id = ?",
                            (goal_id,)).rowcount:
            raise LookupError("Goal not found")


def delete_tracker(tracker_id: str) -> None:
    """Deletes a tracker and its logs.

    Raises:
        LookupError: The tracker does not exist.
    """
    with storage.connect() as conn:
        _create_tables(conn)
        if not conn.execute("DELETE FROM goal_trackers WHERE id = ?",
                            (tracker_id,)).rowcount:
            raise LookupError("Tracker not found")


def _tracker_row(conn, tracker_id: str):
    _create_tables(conn)
    row = conn.execute("SELECT * FROM goal_trackers WHERE id = ?",
                       (tracker_id,)).fetchone()
    if row is None:
        raise LookupError("Tracker not found")
    return row


def mark(tracker_id: str, day: str, done: bool) -> None:
    """Marks a habit done or not done, or logs or clears a slip, on a day.

    Raises:
        LookupError: The tracker does not exist.
        ValueError: The tracker is not a habit or a "days without" tracker,
            or the day is invalid.
    """
    date = datetime.date.fromisoformat(day)
    with storage.connect() as conn:
        row = _tracker_row(conn, tracker_id)
        if row["kind"] not in ("weekly", "without"):
            raise ValueError("Log this tracker with a reading or the timer")
        if date > _now().date() + datetime.timedelta(days=1):
            raise ValueError("A log cannot be in the future")
        conn.execute("DELETE FROM goal_logs WHERE tracker_id = ? AND day = ?",
                     (tracker_id, date.isoformat()))
        if done:
            conn.execute("INSERT INTO goal_logs VALUES (?, ?, ?, 1, ?)",
                         (str(uuid.uuid4()), tracker_id, date.isoformat(),
                          _stamp()))


def start_timer(tracker_id: str) -> None:
    """Starts a timer tracker.

    Raises:
        LookupError: The tracker does not exist.
        ValueError: The tracker is not a timer or is already running.
    """
    with storage.connect() as conn:
        row = _tracker_row(conn, tracker_id)
        if row["kind"] != "timer":
            raise ValueError("Only a timer starts")
        if row["timer_started_at"]:
            raise ValueError("The timer is already running")
        conn.execute("UPDATE goal_trackers SET timer_started_at = ? "
                     "WHERE id = ?", (_stamp(), tracker_id))


def stop_timer(tracker_id: str, utc_offset: int) -> dict[str, float]:
    """Stops a running timer and logs its minutes on the day it started.

    Returns:
        ``minutes``, the logged time, capped at MAX_TIMER_MINUTES.

    Raises:
        LookupError: The tracker does not exist.
        ValueError: The timer is not running.
    """
    offset = _offset(utc_offset)
    with storage.connect() as conn:
        row = _tracker_row(conn, tracker_id)
        if not row["timer_started_at"]:
            raise ValueError("The timer is not running")
        started = datetime.datetime.fromisoformat(row["timer_started_at"])
        minutes = min((_now() - started).total_seconds() / 60,
                      MAX_TIMER_MINUTES)
        conn.execute("UPDATE goal_trackers SET timer_started_at = NULL "
                     "WHERE id = ?", (tracker_id,))
        if minutes >= 1:
            conn.execute("INSERT INTO goal_logs VALUES (?, ?, ?, ?, ?)",
                         (str(uuid.uuid4()), tracker_id,
                          _local_day(row["timer_started_at"],
                                     offset).isoformat(),
                          round(minutes, 1), _stamp()))
    return {"minutes": round(minutes, 1)}


def _met(value: float | None, target: float, direction: str) -> bool:
    if value is None:
        return False
    return value >= target if direction == "at_least" else value <= target


def _day_streak(met: dict[datetime.date, bool], today: datetime.date,
                start: datetime.date) -> int:
    """Counts met days back from today; an unmet today keeps yesterday's."""
    day = today if met.get(today) else today - datetime.timedelta(days=1)
    count = 0
    while day >= start and met.get(day):
        count += 1
        day -= datetime.timedelta(days=1)
    return count


def _monday(day: datetime.date) -> datetime.date:
    return day - datetime.timedelta(days=day.weekday())


def _daily_values(points: list[dict[str, object]], rule: str,
                  offset: datetime.timedelta) -> dict[datetime.date, float]:
    """Combines a measure's readings into one value per local day."""
    values: dict[datetime.date, float] = {}
    for point in points:  # Oldest first, so "last" keeps the latest.
        day = _local_day(str(point["time"]), offset)
        value = float(point["value"])
        values[day] = values.get(day, 0) + value if rule == "sum" else value
    return values


def _progress(row, points: list[dict[str, object]], today: datetime.date,
              offset: datetime.timedelta,
              timer_minutes: dict[datetime.date, float],
              logged: set[datetime.date]) -> dict[str, object]:
    """Computes one tracker's progress for display."""
    kind, target = row["kind"], row["target"]
    start = datetime.date.fromisoformat(row["started_on"])
    week = [today - datetime.timedelta(days=n) for n in range(WEEK_DAYS - 1,
                                                                -1, -1)]
    result: dict[str, object] = {}
    if kind == "daily":
        measure = readings.MEASURES[row["measure"]]
        values = _daily_values(points, measure.daily, offset)
        if measure.daily == "sum" and row["direction"] == "at_most":
            # A day with nothing logged had none, once the tracker existed.
            for n in range((today - start).days + 1):
                values.setdefault(start + datetime.timedelta(days=n), 0.0)
        met = {day: _met(value, target, row["direction"])
               for day, value in values.items()}
        result.update(
            today=values.get(today), met_today=met.get(today, False),
            streak=_day_streak(met, today, start), streak_unit="day",
            days=[{"date": day.isoformat(), "value": values.get(day),
                   "met": met.get(day, False), "tracked": day >= start}
                  for day in week])
    elif kind == "timer":
        met = {day: minutes >= target
               for day, minutes in timer_minutes.items()}
        result.update(
            today=timer_minutes.get(today, 0.0),
            met_today=met.get(today, False),
            streak=_day_streak(met, today, start), streak_unit="day",
            running_since=row["timer_started_at"],
            days=[{"date": day.isoformat(), "value": timer_minutes.get(day),
                   "met": met.get(day, False), "tracked": day >= start}
                  for day in week])
    elif kind == "weekly":
        done = set(logged)
        if row["measure"]:
            done |= {_local_day(str(point["time"]), offset)
                     for point in points}
        monday = _monday(today)
        this_week = [monday + datetime.timedelta(days=n)
                     for n in range(WEEK_DAYS)]
        count = sum(day in done for day in this_week)
        weeks = 0
        week_start = monday if count >= target else monday - \
            datetime.timedelta(days=WEEK_DAYS)
        while week_start + datetime.timedelta(days=WEEK_DAYS - 1) >= start:
            days = [week_start + datetime.timedelta(days=n)
                    for n in range(WEEK_DAYS)]
            if sum(day in done for day in days) < target:
                break
            weeks += 1
            week_start -= datetime.timedelta(days=WEEK_DAYS)
        result.update(
            today=1.0 if today in done else 0.0, met_today=today in done,
            this_week=count, streak=weeks, streak_unit="week",
            from_readings=bool(row["measure"]),
            days=[{"date": day.isoformat(), "met": day in done,
                   "tracked": day >= start, "future": day > today}
                  for day in this_week])
    elif kind == "without":
        last = max(logged) if logged else None
        since = last if last else start - datetime.timedelta(days=1)
        result.update(today=None, met_today=today not in logged,
                      streak=max(0, (today - since).days), streak_unit="day",
                      last_slip=last.isoformat() if last else None)
    elif kind == "target":
        ordered = sorted(points, key=lambda point: str(point["time"]))
        before = [p for p in ordered if _local_day(str(p["time"]), offset)
                  <= start]
        after = [p for p in ordered if _local_day(str(p["time"]), offset)
                 > start]
        baseline = (before[-1] if before else after[0] if after else None)
        latest = ordered[-1] if ordered else None
        fraction = None
        if baseline and latest:
            span = float(baseline["value"]) - target
            moved = float(baseline["value"]) - float(latest["value"])
            fraction = 1.0 if span == 0 else max(0.0, min(1.0, moved / span))
        result.update(
            today=None, met_today=fraction == 1.0, streak=0, streak_unit="day",
            baseline=float(baseline["value"]) if baseline else None,
            baseline_date=str(baseline["time"])[:10] if baseline else None,
            latest=float(latest["value"]) if latest else None,
            latest_date=str(latest["time"])[:10] if latest else None,
            fraction=fraction)
    return result


def overview(today: str, utc_offset: int) -> dict[str, object]:
    """Lists every goal with its trackers' progress.

    Args:
        today: The person's local date, as YYYY-MM-DD.
        utc_offset: The person's offset from UTC in minutes, east positive.

    Returns:
        ``goals``, oldest first, each with ``id``, ``title``,
        ``notebook_id``, ``template`` and ``trackers``; each tracker has its
        settings, ``unit``, ``decimals`` and the progress fields of its kind.
    """
    day = datetime.date.fromisoformat(today)
    offset = _offset(utc_offset)
    series = {item["key"]: item["points"] for item in readings.series()}
    with storage.connect() as conn:
        _create_tables(conn)
        goal_rows = conn.execute(
            "SELECT * FROM goals ORDER BY created_at, rowid").fetchall()
        tracker_rows = conn.execute(
            "SELECT * FROM goal_trackers ORDER BY created_at, rowid").fetchall()
        log_rows = conn.execute("SELECT * FROM goal_logs").fetchall()
    logs: dict[str, list] = {}
    for log in log_rows:
        logs.setdefault(log["tracker_id"], []).append(log)
    goals = []
    for goal in goal_rows:
        trackers = []
        for row in (r for r in tracker_rows if r["goal_id"] == goal["id"]):
            measure = readings.MEASURES.get(row["measure"] or "")
            minutes: dict[datetime.date, float] = {}
            logged: set[datetime.date] = set()
            for log in logs.get(row["id"], []):
                date = datetime.date.fromisoformat(log["day"])
                logged.add(date)
                minutes[date] = minutes.get(date, 0.0) + float(log["value"])
            trackers.append({
                "id": row["id"], "kind": row["kind"], "label": row["label"],
                "measure": row["measure"], "target": row["target"],
                "direction": row["direction"],
                "unit": _unit(row["kind"], measure),
                "decimals": measure.decimals if measure else 0,
                "started_on": row["started_on"],
                **_progress(row, series.get(row["measure"], []) if measure
                            else [], day, offset, minutes, logged),
            })
        goals.append({"id": goal["id"], "title": goal["title"],
                      "notebook_id": goal["notebook_id"],
                      "template": goal["template"], "trackers": trackers})
    return {"goals": goals}


def from_template(key: str, title: str | None = None,
                  targets: dict[int, float] | None = None,
                  notebook_id: str | None = None,
                  today: str | None = None) -> dict[str, object]:
    """Creates a goal from a template, with targets the person entered.

    Args:
        key: The template's key.
        title: The person's own title, or None for the template's.
        targets: Targets by tracker index, replacing the template's.
        notebook_id: The goal's notebook, or None.
        today: The person's local date.

    Raises:
        ValueError: The template does not exist or a target is invalid.
    """
    if key not in _TEMPLATES:
        raise ValueError("Choose a listed goal")
    template = _TEMPLATES[key]
    trackers = []
    for index, tracker in enumerate(template.trackers):
        item = dict(tracker)
        if targets and index in targets:
            item["target"] = targets[index]
        # A tracker whose target the person left blank, such as a weight to
        # reach, is skipped.
        if item.get("target") is not None or item["kind"] == "without":
            trackers.append(item)
    return create(title or template.title, notebook_id, key, trackers, today)
