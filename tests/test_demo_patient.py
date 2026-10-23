"""Yearly synthetic imports, explicit filing and real/demo isolation."""
import io
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from stellis import demo_patient, documents, notebooks, storage
from stellis.server import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('STELLIS_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('STELLIS_AUTH_MODE','off')
    with TestClient(app) as test:
        yield test


def package(year):
    return (demo_patient.STATIC/'years'/f'maya-{year}.zip').read_bytes()


def upload(client, year):
    return client.post('/api/v1/demo/upload',files={'file':(f'maya-{year}.zip',package(year),'application/zip')})


def confirm(client, year, review):
    return client.post(f'/api/v1/demo/years/{year}/dates',json={'dates':{
        record['id']:record['date_suggestion']['date'] for record in review['documents']}})


def test_years_fill_empty_demo_only_after_approval_and_clear_preserves_real(client):
    image=io.BytesIO();Image.new('RGB',(20,20),'white').save(image,format='PNG')
    real,_=documents.create('actual-workspace-sentinel.png',image.getvalue())
    real_book=notebooks.create('Actual workspace sentinel')
    original_file=documents.file_path(real['id'])[0].read_bytes()
    client.post('/api/v1/demo/enter').raise_for_status()
    assert client.get('/api/v1/documents').json()==[]
    assert client.get('/api/v1/notebooks').json()['notebooks']==[]
    assert upload(client,2023).status_code==422
    all_ids=[]
    for year in range(2022,2027):
        result=upload(client,year);assert result.status_code==200,result.text
        review=result.json();assert review['documents']
        assert not review['filed']
        assert all(record['record_date'] is None for record in review['documents'])
        assert client.post(f'/api/v1/demo/years/{year}/notebooks',json={'templates':[review['suggestions'][0]['template_id']]}).status_code==422
        dates=confirm(client,year,review);assert dates.status_code==200,dates.text
        filed=client.post(f'/api/v1/demo/years/{year}/notebooks',json={'templates':[b['template_id'] for b in review['suggestions']]})
        assert filed.status_code==200,filed.text
        assert filed.json()['filed']
        assert all(record['notebook_id'] for record in filed.json()['documents'])
        all_ids += [record['id'] for record in review['documents']]
        count=len(client.get('/api/v1/documents').json())
        assert upload(client,year).status_code==200
        assert len(client.get('/api/v1/documents').json())==count
    assert len(all_ids)==70
    assert client.get('/api/v1/documents/'+real['id']).status_code==404
    client.post('/api/v1/demo/leave').raise_for_status()
    assert [d['id'] for d in client.get('/api/v1/documents').json()]==[real['id']]
    assert client.get('/api/v1/documents/'+all_ids[0]).status_code==404
    client.post('/api/v1/demo/enter')
    old_generation=demo_patient.workspace()
    client.delete('/api/v1/demo/history').raise_for_status()
    assert not old_generation.exists()
    assert documents.get(real['id'])['filename']=='actual-workspace-sentinel.png'
    assert documents.file_path(real['id'])[0].read_bytes()==original_file
    assert next(b for b in notebooks.list_notebooks() if b['id']==real_book['id'])['name']=='Actual workspace sentinel'
    client.post('/api/v1/demo/enter')
    assert client.get('/api/v1/documents').json()==[]
    assert demo_patient.workspace()!=old_generation


def test_demo_zip_tampering_and_traversal_do_not_create_records(client):
    client.post('/api/v1/demo/enter')
    for name,body in [('notes.pdf',b'%PDF-1.0'),('bad.zip',b'broken')]:
        assert client.post('/api/v1/demo/upload',files={'file':(name,body)}).status_code==422
    content=io.BytesIO()
    with zipfile.ZipFile(content,'w') as archive:
        archive.writestr('demo-package.json',json.dumps({'format':'stellis-maya-year-v1','year':2022}))
        archive.writestr('../outside.pdf',b'bad')
    assert client.post('/api/v1/demo/upload',files={'file':('bad.zip',content.getvalue())}).status_code==422
    assert client.get('/api/v1/documents').json()==[]
    assert client.post('/api/v1/documents',files={'file':('notes.pdf',b'%PDF')}).status_code==422


def test_context_is_restored_after_error(client):
    real=storage.data_dir()
    client.post('/api/v1/demo/enter')
    assert client.get('/api/v1/documents/no-such-record').status_code==404
    assert storage.data_dir()==real
    assert not storage.in_demo()


def test_tracking_and_settings_stay_in_their_workspace(client):
    from stellis import ai, reproductive
    real_period=reproductive.save('period',{'start':'2026-01-01','end':'2026-01-05','flow':'Light'})
    key_file=ai._key_file()
    key_file.write_text('synthetic-credential-sentinel')
    client.post('/api/v1/demo/enter').raise_for_status()
    assert client.get('/api/reproductive').json()['records']==[]
    saved=client.post('/api/v1/reproductive/period',json={'start':'2022-01-08','end':'2022-01-11','tracking_gap_before':True})
    assert saved.status_code==200,saved.text
    assert client.get('/api/v1/reproductive').json()['records'][0]['tracking_gap_before']
    assert ai._key_file()==key_file
    assert client.post('/api/v1/ai/key',json={'key':'changed'}).status_code==403
    assert client.post('/api/calendar/connect',json={}).status_code==403
    client.delete('/api/v1/demo/history').raise_for_status()
    assert key_file.read_text()=='synthetic-credential-sentinel'
    assert [r['id'] for r in reproductive.list_records()['records']]==[real_period['id']]


def test_demo_inference_retains_configured_provider_without_managed_tools(tmp_path,monkeypatch):
    from stellis import agent_gateway,ai,runtime_profile
    monkeypatch.setenv('STELLIS_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('NEBIUS_API_KEY','synthetic-provider-key')
    monkeypatch.setenv('STELLIS_ACCOUNT_ID','1')
    for profile,url,key in [('local','http://127.0.0.1:11434/v1','ollama'),('direct','https://api.tokenfactory.nebius.com/v1','synthetic-provider-key')]:
        monkeypatch.setenv('STELLIS_RUNTIME_PROFILE',profile)
        with storage.demo_workspace(tmp_path/'demo'):
            assert runtime_profile.remote_agents()
            assert agent_gateway.configured()
            assert runtime_profile.inference_url()==url
            assert ai._key()==key


def test_demo_reuses_saved_model_configuration_without_patient_data(tmp_path,monkeypatch):
    from stellis import model_routes,runtime_profile
    monkeypatch.setenv('STELLIS_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('STELLIS_RUNTIME_PROFILE','local')
    (tmp_path/'local-inference-model').write_text('installed-local-model')
    model_routes.save({'agent':'installed-agent-model'})
    original=model_routes.path()
    with storage.demo_workspace(tmp_path/'demo'):
        assert model_routes.path()==original
        assert runtime_profile.model_id('agent')=='installed-agent-model'
        assert runtime_profile.model_id('transcript')=='installed-local-model'


def test_clear_waits_for_read_and_stale_requests_cannot_resurrect_demo(client,monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    entered=threading.Event();release=threading.Event()
    client.post('/api/v1/demo/enter').raise_for_status()
    old_generation=demo_patient.workspace()
    original=documents.list_all
    def delayed_read(*args,**kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args,**kwargs)
    monkeypatch.setattr(documents,'list_all',delayed_read)
    with ThreadPoolExecutor(max_workers=2) as pool:
        read=pool.submit(client.get,'/api/v1/documents')
        assert entered.wait(5)
        clear=pool.submit(client.delete,'/api/v1/demo/history')
        try:
            with pytest.raises(TimeoutError):
                clear.result(timeout=0.2)
        finally:
            release.set()
        assert read.result(timeout=5).status_code==200
        assert clear.result(timeout=5).status_code==200
    assert not old_generation.exists()
    stale=client.get('/api/v1/documents',headers={'Cookie':'stellis-demo=maya'})
    assert stale.status_code==410
    assert demo_patient.existing_workspace() is None
    assert not old_generation.exists()
    assert not client.get('/api/v1/demo/status',headers={'Cookie':'stellis-demo=maya'}).json()['active']


def test_clear_interrupts_running_inference_before_waiting_for_response(client,monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import asyncio
    import threading
    from stellis import agent_gateway
    entered=threading.Event()
    monkeypatch.setattr(agent_gateway,'configured',lambda:True)
    monkeypatch.setenv('STELLIS_RUNTIME_PROFILE','direct')
    async def blocked_turn(*args,**kwargs):
        entered.set()
        await asyncio.Event().wait()
    monkeypatch.setattr(agent_gateway,'turn',blocked_turn)
    client.post('/api/v1/demo/enter').raise_for_status()
    agent=client.get('/api/v1/agents').json()[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        ask=pool.submit(client.post,f"/api/v1/agents/{agent['id']}/ask",json={'question':'Synthetic pending question'})
        assert entered.wait(5)
        clear=pool.submit(client.delete,'/api/v1/demo/history')
        assert clear.result(timeout=5).status_code==200
        assert ask.result(timeout=5).status_code==409
    assert demo_patient.existing_workspace() is None
