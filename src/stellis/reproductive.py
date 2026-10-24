"""Cycle and contraception records, kept as a compatibility layer over ``trackers``."""

from stellis import trackers

KINDS = {'period', 'pill', 'larc'}
date = trackers.date


def save(kind, data, record_id=None):
    """Validate and store a tracker entry."""
    if kind not in KINDS:
        raise ValueError('Choose a listed tracker')
    return trackers.save(kind, data, record_id)


def list_records():
    """Return saved entries and dose dates from the current workspace."""
    records = []
    for record in trackers.list_records(KINDS):
        outcomes = record.pop('outcomes')
        record.pop('summary')
        records.append({**record,
                        'doses': [day for day, item in outcomes.items() if item['status'] == 'taken'],
                        'skipped': [day for day, item in outcomes.items() if item['status'] == 'skipped']})
    return {'records': records}


def delete(record_id):
    return trackers.delete(record_id)


def dose(record_id, day, taken, status=None):
    if status not in {None, 'taken', 'skipped'}:
        raise ValueError('Choose a listed dose status')
    return trackers.log(record_id, day, status or ('taken' if taken else None))
