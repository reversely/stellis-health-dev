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
 from stellis import agent_artifacts,agent_followups,storage
 source=pages.list_pages(book)[0];source=pages.get(source['id'])
 candidate=agent_followups.validate({'text':'Request the missing signed approval record','source_index':1,'quote':'No approval record has been received.'},[{'source_id':source['id'],'title':source['title'],'target':'/page/'+source['id'],'excerpt':source['markdown']}])
 job=agents.start_job(origin['id'],book);message=agents.append_message(origin['id'],'agent','Draft ready',book,job)
 draft=agent_artifacts.create(origin['id'],message['id'],book,'document','Review checklist','Check the missing approval record.',[],[],candidate)
 agents.finish_job(job,'succeeded');proposal_id=agent_artifacts.get(draft['id'])['follow_up']['id']
 with open('/tmp/stellis-followups-ui-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8825'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8825/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8825'
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'coordination-proof','password':'disposable-proof-password'}).status==200
    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text()
    audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for location in ['/chat/'+origin['id'],'/notebook/'+book]:
     page.goto(base+location);card=page.locator(f'[data-suggestion-id="{proposal_id}"]');card.wait_for()
     for width in [360,390,768,1024,1280,1440,1920]:
      for theme in ['light','dark']:
       page.set_viewport_size({'width':width,'height':844 if width<768 else 1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
       card.scroll_into_view_if_needed()
       if width in [390,1440]:page.screenshot(path=str(out/f'review-{location.split("/")[1]}-{width}-{theme}.png'),full_page=True)
       reports.append({'location':location.split('/')[1],'width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
     card.get_by_role('button',name='Edit task',exact=True).click();card.get_by_label('Task',exact=True).fill('Request the missing approval record')
     page.wait_for_timeout(5500);assert card.get_by_label('Task',exact=True).input_value()=='Request the missing approval record'
     card.get_by_role('button',name='Save task',exact=True).click()
    (out/'followup-layout.json').write_text(json.dumps(reports,indent=2))
    card.get_by_role('button',name='Dismiss',exact=True).click();card.wait_for(state='detached')
    page.reload();assert page.locator(f'[data-suggestion-id="{proposal_id}"]').count()==0
    page.goto(base+'/chat/'+origin['id']);page.get_by_text('Dismissed',exact=True).wait_for()
    with storage.connect() as conn:assert conn.execute('SELECT count(*) FROM todo_items').fetchone()[0]==0
    assert not errors,errors
    print('Both surfaces: editor survives refresh, dismissal persists, no task created; geometry captured',flush=True)
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
