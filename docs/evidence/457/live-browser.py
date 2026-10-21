import os,tempfile,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/457';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-coordination-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,notebook_work,onboarding
 auth.register('coordination-proof','disposable-proof-password')
 account=auth.account_id_for_username('coordination-proof');onboarding.choose(account,[],'review');onboarding.complete(account)
 book=notebooks.create('Review project')['id'];notebooks.update(book,todo_list='on')
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
    question='Draft a review checklist based on the notebook notes. Ask the notebook steward to gather the evidence, then ask Reviewer to check which requirements remain unconfirmed before you write it. Include one proposed follow-up to obtain missing evidence.'
    composer.locator('textarea').fill(question);composer.get_by_role('button',name='Send',exact=True).click()
    page.get_by_role('list',name='Work steps').wait_for(timeout=15000)
    print('Persisted work steps visible while local planning runs',flush=True)
    page.reload();page.get_by_role('list',name='Work steps').wait_for(timeout=15000)
    previous=None
    for _ in range(300):
     jobs=context.request.get(base+f'/api/v1/agents/{origin["id"]}/jobs').json();job=jobs[-1]
     state=[(s['agent_name'],s['state']) for s in job['steps']]
     if state!=previous:print(state,flush=True);previous=state
     if job['state']!='running':break
     page.wait_for_timeout(2000)
    (out/'live-job.json').write_text(json.dumps(job,indent=2))
    from stellis import runtime_trace
    (out/'inference-traces.json').write_text(json.dumps(runtime_trace.recent(),indent=2))
    assert job['state']=='succeeded',job
    assert {steward['id'],reviewer['id']} <= {s['agent_id'] for s in job['steps']}
    page.locator('.agent-artifact').wait_for(timeout=10000)
    proposal=page.locator('.agent-followup');proposal.wait_for(timeout=10000)
    assert 'approval' in proposal.inner_text().lower()
    assert not __import__('re').search(r'create.{0,50}approval',proposal.inner_text().lower()),proposal.inner_text()
    assert proposal.locator('blockquote').count()==1
    print('Actual local final draft includes a quoted follow-up proposal',flush=True)
    for width,theme in [(1440,'dark'),(1440,'light'),(390,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     proposal.scroll_into_view_if_needed();page.screenshot(path=str(out/f'followup-{width}-{theme}.png'),full_page=True)
    proposal.get_by_role('button',name='Edit task',exact=True).click()
    proposal.get_by_label('Task',exact=True).fill('Request the missing signed approval record')
    proposal.get_by_role('button',name='Save task',exact=True).click()
    page.reload();proposal.get_by_text('Request the missing signed approval record',exact=True).wait_for()
    artifacts=context.request.get(base+f'/api/v1/agents/{origin["id"]}/artifacts').json();suggestion_id=artifacts[0]['follow_up']['id']
    page.goto(base+'/notebook/'+book)
    suggestion=page.locator(f'[data-suggestion-id="{suggestion_id}"]')
    suggestion.get_by_text('Request the missing signed approval record',exact=True).wait_for()
    suggestion.get_by_role('button',name='Add task',exact=True).click();suggestion.wait_for(state='detached')
    assert context.request.post(base+'/api/v1/suggestions/accept',data={'ids':[suggestion_id]}).status==200
    with __import__('stellis.storage',fromlist=['connect']).connect() as conn:
     rows=conn.execute('SELECT text FROM todo_items').fetchall()
    assert [r['text'] for r in rows]==['Request the missing signed approval record'],rows
    page.goto(base+'/chat/'+origin['id']);page.get_by_text('Task added',exact=True).wait_for()
    print('Edit and reload, notebook acceptance, repeated acceptance and thread state passed with one task',flush=True)
    assert not errors,errors
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
