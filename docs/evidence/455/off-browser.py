import os,tempfile,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/455';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-coordination-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,notebook_work,onboarding
 auth.register('coordination-proof','disposable-proof-password')
 account=auth.account_id_for_username('coordination-proof');onboarding.choose(account,[],'review');onboarding.complete(account)
 book=notebooks.create('Review project')['id']
 origin=agents.create('Writing','Prepare sourced documents and replies',notebook_id=book)
 steward=agents.create('Notebook steward','Gather notebook evidence and identify missing information',notebook_id=book,steward=True)
 reviewer=agents.create('Reviewer','Check claims against the notebook requirements; distinguish confirmed facts from missing evidence',notebook_id=book)
 notebook_work.save_instructions(book,'Never claim approval without an explicit approval record.',0)
 pages.create('Review requirements',book,'The review requires measured inputs and outputs and a signed approval record. Measurements were recorded on Tuesday. No approval record has been received.')
 with open('/tmp/stellis-coordination-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8824'
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'coordination-proof','password':'disposable-proof-password'}).status==200
    page.goto(base+'/chat/'+origin['id']);composer=page.locator('.agent-composer')
    composer.get_by_label('Notebook context').select_option(book)
    question='Draft a review checklist based on the notebook notes. Ask the notebook steward to gather the evidence, then ask Reviewer to check which requirements remain unconfirmed before you write it.'
    composer.locator('textarea').fill(question);composer.get_by_role('button',name='Send',exact=True).click()
    page.get_by_role('list',name='Work steps').wait_for(timeout=15000)
    print('Persisted work steps visible while local planning runs',flush=True)
    page.reload();page.get_by_role('list',name='Work steps').wait_for(timeout=15000)
    assert composer.locator('textarea').input_value()=='', 'Reload restored an already submitted question'
    for _ in range(120):
     jobs=context.request.get(base+f'/api/v1/agents/{origin["id"]}/jobs').json();job=jobs[-1]
     active=next((s for s in job['steps'] if s['state']=='running' and s['child_job_id']),None)
     if active:break
     assert job['state']=='running',job
     page.wait_for_timeout(1000)
    assert active,job
    print('Active child job linked to running step',flush=True)
    response=context.request.patch(base+f'/api/v1/agents/{active["agent_id"]}/notebooks/{book}',data={'enabled':False})
    assert response.status==200,response.text()
    for _ in range(30):
     jobs=context.request.get(base+f'/api/v1/agents/{origin["id"]}/jobs').json();job=jobs[-1]
     if job['state']!='running':break
     page.wait_for_timeout(1000)
    assert job['state']=='interrupted',job
    assert all(s['state']!='running' for s in job['steps'])
    assert not context.request.get(base+f'/api/v1/agents/{origin["id"]}/artifacts').json()
    (out/'off-interruption.json').write_text(json.dumps(job,indent=2))
    print('Turning off active participant stops parent and later steps without a final artifact',flush=True)
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
