"""A notebook's Brief: day strip, medicine courses, coming up and levels.

Everything is projected from records: tracker courses linked to the notebook,
its care events, and accepted lab facts from its documents. Reference
intervals and lab flags come from each fact's quoted source line.
"""
from __future__ import annotations

import datetime as dt
import re

from stellis import care_events, health_facts, notebook_sources, notebooks, readings, trackers

STRIP_BEFORE = 3
STRIP_AFTER = 11
LEVEL_KINDS = ('lab_result', 'vital_sign')
_NUMBER = re.compile(r'^[<>≤≥]?\s*(-?\d+(?:\.\d+)?)$')
# A reference interval such as "15-150", "15 – 150" or "15 to 150" after the value.
_RANGE = re.compile(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(?![\d.])')
# A lab flag at the end of the line, such as "L", "H" or "Low".
_FLAG = re.compile(r'(?:^|\s)(LL|HH|L|H|Low|High)\s*\*?$', re.IGNORECASE)


def _number(value):
    match = _NUMBER.match(str(value).strip())
    return float(match.group(1)) if match else None


def reference(quote: str, value: str) -> dict:
    """The reference interval and lab flag stated in a fact's source line.

    Returns:
        ``low`` and ``high`` (or None) and ``flag``: "low", "high" or None.
    """
    text = ' '.join(str(quote).split())
    start = text.find(str(value))
    rest = text[start + len(str(value)):] if start >= 0 else text
    low = high = None
    match = _RANGE.search(rest)
    if match and float(match.group(1)) < float(match.group(2)):
        low, high = float(match.group(1)), float(match.group(2))
    flag = _FLAG.search(rest)
    word = flag.group(1).upper() if flag else ''
    return {'low': low, 'high': high,
            'flag': 'low' if word in {'L', 'LL', 'LOW'} else 'high' if word in {'H', 'HH', 'HIGH'} else None}


def status(point: dict) -> dict | None:
    """The label a point shows: the lab's flag first, else its position in the interval."""
    if point['flag']:
        return {'label': point['flag'].capitalize(), 'tone': 'alert', 'by_lab': True}
    if point['low'] is None:
        return None
    if point['value'] < point['low']:
        return {'label': 'Below range', 'tone': 'alert', 'by_lab': False}
    if point['value'] > point['high']:
        return {'label': 'Above range', 'tone': 'alert', 'by_lab': False}
    return {'label': 'In range', 'tone': 'ok', 'by_lab': False}


def _key(name, unit):
    return (' '.join(name.casefold().split()), unit.replace('µ', 'u').replace('μ', 'u').casefold().strip())


def levels(notebook_id: str) -> list[dict]:
    """Numeric lab and vital facts in this notebook, each with matching points from other notebooks."""
    names = {book['id']: book['name'] for book in notebooks.list_notebooks()}
    own_documents = {source['id'].partition(':')[2] for source in notebook_sources.list_sources(notebook_id)
                     if source['id'].startswith('document:')}
    series = {}
    for fact in health_facts.accepted():
        value = _number(fact['value'])
        if fact['kind'] not in LEVEL_KINDS or value is None:
            continue
        own = fact['document_id'] in own_documents
        point = {'date': fact['date'], 'value': value, 'own': own, 'title': fact['document_title'],
                 'page': fact['page'], 'target': fact['target'], 'notebook': names.get(fact['notebook_id']),
                 **reference(fact['quote'], fact['value'])}
        point['status'] = status(point)
        entry = series.setdefault(_key(fact['name'], fact['unit']),
                                  {'name': fact['name'], 'unit': fact['unit'], 'points': [], 'has_own': False})
        entry['points'].append(point)
        entry['has_own'] = entry['has_own'] or own
    # Readings logged into this notebook join as their own measures.
    for reading in readings.stored_points(notebook_id):
        measure = readings.MEASURES[reading['measure']]
        point = {'date': reading['time'][:10], 'value': reading['value'], 'value2': reading['value2'], 'own': True,
                 'title': reading['title'], 'page': None, 'target': reading['target'], 'notebook': names.get(notebook_id),
                 'low': None, 'high': None, 'flag': None, 'status': None}
        entry = series.setdefault(_key(measure.label, measure.unit),
                                  {'name': measure.label, 'unit': measure.unit, 'points': [], 'has_own': True})
        entry['points'].append(point)
    result = []
    for key, entry in series.items():
        if not entry['has_own']:
            continue
        points = sorted(entry['points'], key=lambda point: point['date'])
        mine = [point for point in points if point['own']]
        lows = [point['low'] for point in points if point['low'] is not None]
        highs = [point['high'] for point in points if point['high'] is not None]
        # The most common interval stands for "most reports"; each point keeps its own.
        common_low = max(set(lows), key=lows.count) if lows else None
        common_high = max(set(highs), key=highs.count) if highs else None
        result.append({
            'key': '|'.join(key), 'name': entry['name'], 'unit': entry['unit'], 'points': points,
            'latest': mine[-1], 'previous': mine[-2] if len(mine) > 1 else None,
            'flagged': {'low': sum(p['flag'] == 'low' for p in points), 'high': sum(p['flag'] == 'high' for p in points),
                        'total': len(points)},
            'reference': {'low': common_low, 'high': common_high,
                          'shared': len(set(lows)) <= 1 and len(set(highs)) <= 1},
            'other_notebooks': sorted({p['notebook'] for p in points if not p['own'] and p['notebook']}),
        })
    # Newest first; names A to Z within a date.
    return sorted(sorted(result, key=lambda level: level['name'].casefold()),
                  key=lambda level: level['latest']['date'], reverse=True)


def _course_detail(record, item):
    if not item['key'].startswith('fill-'):
        return 'Last planned dose'
    unit = record.get('supply_unit') or 'units'
    repeats = record.get('repeats') or 0
    allowed = 'No repeats' if not repeats else f"{repeats} repeat{'s' if repeats > 1 else ''} allowed"
    return (f"{record['units_per_fill']} {unit} per fill, {trackers.schedule_text(record).lower()} "
            f"from {dt.date.fromisoformat(record['start']):%B %-d}. {allowed}.")


def coming_up(notebook_id, today, courses) -> list[dict]:
    """Pending items only: calculated course dates and care events from today on."""
    items = []
    for record in courses:
        source = ({'title': record['source_title'] + (f", page {record['source_page']}" if record['source_page'] else ''),
                   'target': f"/document/{record['source_document_id']}" +
                             (f"?page={record['source_page']}" if record['source_page'] else '')}
                  if record.get('source_document_id') else None)
        for item in record['summary']['derived']:
            if item['date'] >= today.isoformat():
                items.append({'date': item['date'], 'precision': 'day', 'title': item['title'],
                              'detail': _course_detail(record, item), 'status': item['status'], 'source': source})
    for event in care_events.list_all(notebook_id):
        when = dt.datetime.fromisoformat(event['starts_at']).date()
        if when >= today:
            planned = event['status'] == 'planned'
            detail = ' '.join(part for part in ['No date booked.' if planned else '', event['note']] if part)
            items.append({'date': when.isoformat(), 'precision': 'month' if planned else 'day',
                          'title': event['title'], 'detail': detail, 'status': event['status'],
                          'source': {'title': 'Appointment details', 'target': event['target']}})
    return sorted(items, key=lambda item: item['date'])


def strip(today, courses) -> list[dict]:
    """Days around today with each course's logged or expected dose."""
    days = []
    for offset in range(-STRIP_BEFORE, STRIP_AFTER + 1):
        day = today + dt.timedelta(days=offset)
        marks = []
        for record in courses:
            kind = trackers.KINDS[record['kind']]
            logged = record['outcomes'].get(day.isoformat(), {}).get('status')
            if logged:
                marks.append({'record_id': record['id'], 'state': logged})
            elif kind.expected(record, day):
                marks.append({'record_id': record['id'], 'state': 'expected' if day >= today else 'missed'})
        days.append({'date': day.isoformat(), 'today': offset == 0, 'marks': marks})
    return days


def brief(notebook_id: str, today: dt.date | None = None) -> dict:
    """The Brief for one notebook.

    Raises:
        LookupError: The notebook does not exist.
    """
    if not notebooks.exists(notebook_id):
        raise LookupError('Notebook not found')
    today = today or dt.date.today()
    courses = [record for record in trackers.list_records(notebook_id=notebook_id, today=today)
               if trackers.KINDS[record['kind']].logs and record['kind'] != 'pill']
    treatments = [{'name': record['name'], 'start': record['start'], 'end': record.get('end') or None}
                  for record in courses]
    return {'today': today.isoformat(), 'strip': strip(today, courses), 'courses': courses,
            'coming_up': coming_up(notebook_id, today, courses), 'levels': levels(notebook_id),
            'treatments': treatments}
