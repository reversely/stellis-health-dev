"""Vital sign readings over time, from records, the person and the camera.

A measure's series joins three sources. Accepted health facts from the
person's documents become readings on the fly, so rejecting a fact removes
its point. Readings the person logs and camera readings are stored here. Each
series also has a usual range taken from the person's own readings, so a new
value is compared with their past rather than with population norms.
"""

from __future__ import annotations

import dataclasses
import datetime
import re
import uuid

from stellis import health_facts
from stellis import storage

SOURCES = ("record", "self", "camera")
STORED_SOURCES = ("self", "camera")
USUAL_DAYS = 90
USUAL_MIN_READINGS = 5
MAX_NOTE = 200

_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
_PAIR = re.compile(r"(\d{2,3})\s*/\s*(\d{2,3})")
_POUNDS_PER_KG = 2.2046226218


@dataclasses.dataclass(frozen=True)
class Measure:
    """One kind of reading.

    Attributes:
        key: The measure's ID.
        label: The name the person sees.
        unit: The unit every reading is stored in.
        decimals: Decimal places to show.
        bounds: The lowest and highest plausible values.
        names: Fact names, case-folded, that map to this measure.
        paired: Whether a reading has two values (systolic over diastolic).
        daily: How a day's readings combine for goals: "last" keeps the
            latest, "sum" adds them up (steps, glasses of water).
    """
    key: str
    label: str
    unit: str
    decimals: int
    bounds: tuple[float, float]
    names: tuple[str, ...]
    paired: bool = False
    daily: str = "last"


MEASURES = {
    measure.key: measure for measure in (
        Measure("weight", "Weight", "kg", 1, (20, 350), ("weight",
                                                         "body weight")),
        Measure("blood_pressure",
                "Blood pressure",
                "mmHg",
                0, (30, 260), ("blood pressure", "bp"),
                paired=True),
        Measure("pulse", "Pulse", "bpm", 0, (25, 250), ("pulse", "heart rate",
                                                        "pulse rate")),
        Measure("breathing_rate", "Breathing rate", "breaths/min", 0, (4, 60), (
            "breathing rate", "respiratory rate", "respiration rate")),
        Measure("hrv", "Heart rate variability", "ms", 0, (5, 300), (
            "heart rate variability", "hrv", "rmssd")),
        Measure("hba1c", "HbA1c", "%", 1, (
            3, 20), ("hba1c", "a1c", "hemoglobin a1c", "haemoglobin a1c",
                     "hemoglobin a1c/hemoglobin.total in blood")),
        Measure("blood_glucose", "Blood sugar", "mg/dL", 0, (20, 600), (
            "glucose", "blood glucose", "blood sugar", "fasting glucose")),
        Measure("sleep", "Sleep", "hours", 1, (0.5, 24), ("sleep",
                                                         "sleep duration"),
                daily="sum"),
        Measure("pain", "Pain", "of 10", 0, (0, 10), ("pain score",
                                                       "pain")),
    )
}


def _create_table(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id TEXT PRIMARY KEY,
            measure TEXT NOT NULL,
            value REAL NOT NULL,
            value2 REAL,
            taken_at TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('self', 'camera')),
            quality REAL,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL)""")


def _now() -> str:
    return datetime.datetime.now(
        datetime.timezone.utc).isoformat(timespec="seconds")


def _measure(key: str) -> Measure:
    if key not in MEASURES:
        raise ValueError("Choose a listed measure")
    return MEASURES[key]


def _check_value(measure: Measure, value: float) -> None:
    low, high = measure.bounds
    if not low <= value <= high:
        raise ValueError(f"Enter a {measure.label.lower()} between "
                         f"{low:g} and {high:g} {measure.unit}")


def _taken_at(text: str | None) -> str:
    """Normalises a reading time to UTC ISO seconds; None means now."""
    if text is None:
        return _now()
    try:
        moment = datetime.datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("Enter the time as an ISO date and time") from exc
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    if moment > datetime.datetime.now(datetime.timezone.utc) + \
            datetime.timedelta(minutes=5):
        raise ValueError("A reading cannot be in the future")
    return moment.astimezone(
        datetime.timezone.utc).isoformat(timespec="seconds")


def add(measure_key: str,
        value: float,
        value2: float | None = None,
        taken_at: str | None = None,
        source: str = "self",
        quality: float | None = None,
        note: str = "") -> dict[str, object]:
    """Stores a reading the person logged or the camera measured.

    Args:
        measure_key: A key of ``MEASURES``.
        value: The value, or the systolic value for blood pressure.
        value2: The diastolic value for blood pressure, else None.
        taken_at: When it was measured, as ISO 8601. None means now.
        source: "self" or "camera".
        quality: The camera's signal quality from 0 to 1, else None.
        note: An optional note of at most ``MAX_NOTE`` characters.

    Returns:
        The stored reading as ``series`` lists it.

    Raises:
        ValueError: A field is missing, out of range or malformed.
    """
    measure = _measure(measure_key)
    if source not in STORED_SOURCES:
        raise ValueError("Choose a self or camera reading")
    _check_value(measure, value)
    if measure.paired:
        if value2 is None:
            raise ValueError("Enter both blood pressure numbers")
        _check_value(measure, value2)
        if value2 >= value:
            raise ValueError("The first blood pressure number is the larger")
    elif value2 is not None:
        raise ValueError(f"{measure.label} has one number")
    if quality is not None and not 0 <= quality <= 1:
        raise ValueError("Quality is between 0 and 1")
    note = " ".join(note.split())
    if len(note) > MAX_NOTE:
        raise ValueError(f"Keep the note under {MAX_NOTE} characters")
    reading_id = str(uuid.uuid4())
    with storage.connect() as conn:
        _create_table(conn)
        conn.execute(
            """
            INSERT INTO readings (id, measure, value, value2, taken_at,
                source, quality, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (reading_id, measure.key, value, value2, _taken_at(taken_at),
             source, quality, note, _now()))
        row = conn.execute("SELECT * FROM readings WHERE id = ?",
                           (reading_id,)).fetchone()
    return _stored_point(row)


def delete(reading_id: str) -> None:
    """Deletes a logged or camera reading.

    Raises:
        LookupError: The reading does not exist.
    """
    with storage.connect() as conn:
        _create_table(conn)
        if not conn.execute("DELETE FROM readings WHERE id = ?",
                            (reading_id,)).rowcount:
            raise LookupError("Reading not found")


def _stored_point(row) -> dict[str, object]:
    return {
        "id": row["id"],
        "measure": row["measure"],
        "time": row["taken_at"],
        "value": row["value"],
        "value2": row["value2"],
        "source": row["source"],
        "quality": row["quality"],
        "note": row["note"],
        "title": "Camera reading" if row["source"] == "camera" else "You",
        "target": None,
    }


def match_measure(name: str) -> Measure | None:
    """Finds the measure a fact name describes, if any."""
    folded = " ".join(name.casefold().split())
    for measure in MEASURES.values():
        if folded in measure.names:
            return measure
    return None


def fact_point(fact: dict[str, object]) -> dict[str, object] | None:
    """Turns an accepted fact into a reading, or None when it is not one.

    Weights in pounds become kilograms. Values outside a measure's bounds are
    dropped, so a misread number never reaches a graph.
    """
    if fact["kind"] not in health_facts.MEASURED:
        return None
    try:
        datetime.date.fromisoformat(str(fact["date"]))
    except ValueError:
        # Earlier extraction versions allowed impossible calendar dates.
        # Keep the fact available for review without breaking every chart.
        return None
    measure = match_measure(str(fact["name"]))
    if measure is None:
        return None
    text = str(fact["value"])
    value2 = None
    if measure.paired:
        pair = _PAIR.search(text)
        if pair is None:
            return None
        value, value2 = float(pair.group(1)), float(pair.group(2))
    else:
        number = _NUMBER.search(text)
        if number is None:
            return None
        value = float(number.group())
        if measure.key == "weight" and str(
                fact["unit"]).casefold() in ("lb", "lbs", "pounds", "[lb_av]"):
            value = round(value / _POUNDS_PER_KG, 1)
    low, high = measure.bounds
    if not all(low <= item <= high
               for item in (value, value2)
               if item is not None):
        return None
    return {
        "id": f"fact:{fact['id']}",
        "measure": measure.key,
        "time": str(fact["date"]),
        "value": value,
        "value2": value2,
        "source": "record",
        "quality": None,
        "note": "",
        "title": str(fact.get("document_title") or "Record"),
        "target": fact["target"],
    }


def _percentile(values: list[float], fraction: float) -> float:
    """Linear-interpolated percentile of sorted values."""
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def usual_range(points: list[dict[str, object]]) -> dict[str, float] | None:
    """The middle 80% of the readings before the latest one.

    The window is the ``USUAL_DAYS`` days before the latest reading, so a
    person whose newest record is months old still gets a range.

    Args:
        points: One measure's readings, oldest first.

    Returns:
        ``low`` and ``high`` (and ``low2``/``high2`` for blood pressure) and
        ``since``, the window's first date, or None with fewer than
        ``USUAL_MIN_READINGS`` earlier readings.
    """
    if len(points) <= USUAL_MIN_READINGS:
        return None
    latest = _day(points[-1]["time"])
    start = latest - datetime.timedelta(days=USUAL_DAYS)
    window = [
        point for point in points[:-1] if start <= _day(point["time"]) < latest
    ]
    if len(window) < USUAL_MIN_READINGS:
        return None
    values = sorted(float(point["value"]) for point in window)
    usual = {
        "low": _percentile(values, 0.1),
        "high": _percentile(values, 0.9),
        "since": start.isoformat(),
    }
    if window[0]["value2"] is not None:
        lows = sorted(float(point["value2"]) for point in window)
        usual.update(low2=_percentile(lows, 0.1), high2=_percentile(lows, 0.9))
    return usual


def _day(time: object) -> datetime.date:
    return datetime.date.fromisoformat(str(time)[:10])


def status(latest: dict[str, object], usual: dict[str, float] | None) -> str:
    """Compares the latest reading with the usual range.

    Returns:
        "usual", "above", "below", or "unknown" without a range. Blood
        pressure is above or below when either number is.
    """
    if usual is None:
        return "unknown"
    pairs = [(latest["value"], usual["low"], usual["high"])]
    if latest["value2"] is not None and "low2" in usual:
        pairs.append((latest["value2"], usual["low2"], usual["high2"]))
    if any(value > high for value, _, high in pairs):
        return "above"
    if any(value < low for value, low, _ in pairs):
        return "below"
    return "usual"


def _day_totals(points: list[dict[str, object]]) -> list[dict[str, object]]:
    """Adds up a counted measure's readings per UTC day, oldest first."""
    totals: dict[str, float] = {}
    for point in points:
        day = str(point["time"])[:10]
        totals[day] = totals.get(day, 0.0) + float(point["value"])
    return [{"time": day, "value": value, "value2": None}
            for day, value in totals.items()]


def series() -> list[dict[str, object]]:
    """Lists every measure with its readings, usual range and status.

    Returns:
        One dict per measure in ``MEASURES`` order, with ``key``, ``label``,
        ``unit``, ``decimals``, ``paired``, ``daily``, ``points`` (oldest first),
        ``usual`` and ``status``.
    """
    points: dict[str, list[dict[str, object]]] = {key: [] for key in MEASURES}
    for fact in health_facts.accepted():
        point = fact_point(fact)
        if point is not None:
            points[point["measure"]].append(point)
    with storage.connect() as conn:
        _create_table(conn)
        for row in conn.execute("SELECT * FROM readings"):
            if row["measure"] in points:
                points[row["measure"]].append(_stored_point(row))
    result = []
    for key, measure in MEASURES.items():
        ordered = sorted(points[key], key=lambda point: str(point["time"]))
        # A counted measure compares day totals, not single entries.
        compared = _day_totals(ordered) if measure.daily == "sum" else ordered
        usual = usual_range(compared)
        result.append({
            "key": key,
            "label": measure.label,
            "unit": measure.unit,
            "decimals": measure.decimals,
            "paired": measure.paired,
            "daily": measure.daily,
            "points": ordered,
            "usual": usual,
            "status": status(compared[-1], usual) if compared else "unknown",
        })
    return result
