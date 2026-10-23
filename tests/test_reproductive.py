"""Tracker validation and persistence through workspace storage."""
import pytest
from stellis import reproductive as tracker


@pytest.fixture(autouse=True)
def workspace(tmp_path, monkeypatch):
    monkeypatch.setenv('STELLIS_DATA_DIR', str(tmp_path))


def test_pack_dose_round_trip_and_break_day():
    pack = tracker.save('pill', dict(name='Pack', start='2026-01-01', active=21, break_days=7, time='09:00'))
    tracker.dose(pack['id'], '2026-01-01', True)
    tracker.dose(pack['id'], '2026-01-01', True)
    assert tracker.list_records()['records'][0]['doses'] == ['2026-01-01']
    with pytest.raises(ValueError):
        tracker.dose(pack['id'], '2026-01-22', True)
    tracker.dose(pack['id'], '2026-01-01', False)
    assert tracker.list_records()['records'][0]['doses'] == []
    tracker.delete(pack['id'])
    assert tracker.list_records()['records'] == []


def test_period_overlap_and_edit():
    data = dict(start='2026-01-01', end='2026-01-05', flow='Light', note='<img src=x>')
    period = tracker.save('period', data)
    with pytest.raises(ValueError, match='overlap'):
        tracker.save('period', {**data, 'start': '2026-01-04'})
    tracker.save('period', {**data, 'flow': 'Heavy'}, period['id'])
    assert tracker.list_records()['records'][0]['flow'] == 'Heavy'


def test_larc_requires_persons_renewal_date():
    data = dict(name='Device', type='Implant', start='2026-01-01', renewal='2026-01-01', notice=30)
    with pytest.raises(ValueError):
        tracker.save('larc', data)
    tracker.save('larc', {**data, 'renewal': '2030-01-01'})
    assert tracker.list_records()['records'][0]['renewal'] == '2030-01-01'


def test_workspace_isolation(tmp_path, monkeypatch):
    tracker.save('period', dict(start='2026-01-01', end='2026-01-05', flow='Light'))
    monkeypatch.setenv('STELLIS_DATA_DIR', str(tmp_path / 'another-account'))
    assert tracker.list_records()['records'] == []


def test_removed_device_keeps_history():
    tracker.save('larc', dict(name='Device', type='Copper IUD', start='2025-01-01',
                             renewal='2030-01-01', end='2026-01-01', notice=30))
    assert tracker.list_records()['records'][0]['end'] == '2026-01-01'


def test_skipped_dose_is_distinct_and_reversible():
    pack = tracker.save('pill', dict(name='Pack', start='2026-01-01', active=21, break_days=7, time='09:00'))
    tracker.dose(pack['id'], '2026-01-02', False, status='skipped')
    record = tracker.list_records()['records'][0]
    assert record['doses'] == []
    assert record['skipped'] == ['2026-01-02']
    tracker.dose(pack['id'], '2026-01-02', True)
    record = tracker.list_records()['records'][0]
    assert record['doses'] == ['2026-01-02']
    assert record['skipped'] == []
    tracker.dose(pack['id'], '2026-01-02', False)
    assert tracker.list_records()['records'][0]['doses'] == []


def test_existing_doses_migrate_without_changing_dates():
    from stellis import storage
    with storage.connect() as conn:
        conn.execute('CREATE TABLE pill_doses (pill_id TEXT, day TEXT, PRIMARY KEY (pill_id, day))')
        conn.execute("INSERT INTO pill_doses VALUES ('pack', '2026-01-02')")
    pack = tracker.save('pill', dict(name='Pack', start='2026-01-01', active=21, break_days=7, time='09:00'), 'pack')
    assert pack['id'] == 'pack'
    assert tracker.list_records()['records'][0]['doses'] == ['2026-01-02']
