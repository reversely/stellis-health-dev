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
    draft_text=page.locator('.agent-artifact').inner_text().lower()
    (out/'draft-review.txt').write_text(draft_text)
    assert 'approval' in draft_text
    assert not any(term in draft_text for term in ['will ask','will be refined after','waiting for reviewer','after the notebook steward']),draft_text
    page.reload();page.locator('.agent-artifact').wait_for();assert page.locator('.agent-work-step').count()>=4
    page.locator('.agent-thread-feed').evaluate('(e)=>e.scrollTop=0')
    for width,theme in [(1440,'dark'),(1440,'light'),(390,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     page.screenshot(path=str(out/f'work-{width}-{theme}.png'),full_page=True)

    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text()
    audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for width in [360,390,768,1024,1280,1440,1920]:
     for theme in ['light','dark']:
      page.set_viewport_size({'width':width,'height':844 if width<768 else 1100})
      page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
      findings=page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})
      reports.append({'width':width,'theme':theme,'findings':findings})
    (out/'work-layout.json').write_text(json.dumps(reports,indent=2))
    print('Actual local planning, evidence gathering, specialist review, final artifact and reload passed',flush=True)
    composer.locator('textarea').fill(question);composer.get_by_role('button',name='Send',exact=True).click()
    page.get_by_role('button',name='Stop reply',exact=True).wait_for(timeout=15000)
    page.get_by_role('button',name='Stop reply',exact=True).click();page.wait_for_timeout(2000)
    jobs=context.request.get(base+f'/api/v1/agents/{origin["id"]}/jobs').json()
    assert jobs[-1]['state']=='interrupted',jobs[-1]
    assert page.locator('.agent-artifact').count()==1
    assert not errors,errors
    print('Stopping coordinated work prevents a second artifact',flush=True)
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
