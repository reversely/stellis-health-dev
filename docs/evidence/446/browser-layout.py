import os,tempfile,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path.cwd();out=root/'docs/evidence/446';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-work-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1',NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,onboarding,agents,pages,notebooks,suggestions,agent_artifacts
 auth.register('work-proof','local-work-proof-password');account=auth.account_id_for_username('work-proof');onboarding.choose(account,['learning'],'review');created=onboarding.complete(account);book=created['created'][0]['notebook_id'];notebooks.update(book,todo_list='on');agent=next(a for a in agents.list_agents() if a.get('template_id')=='steward')
 note=pages.create('Practice notes',notebook_id=book,markdown='The practice objective is to constrain a rectangle and check its dimensions.')
 suggestion=suggestions.propose(agent['name'],'page',note['id'],'add_todo',{'text':'Check the rectangle dimensions'})
 message=agents.append_message(agent['id'],'agent','Draft ready',book);draft=agent_artifacts.create(agent['id'],message['id'],book,'document','Practice checklist','Check dimensions.\n\nRecord observations.',[],[])
 with open('/tmp/stellis-work-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/v1/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base='http://127.0.0.1:8824'
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'work-proof','password':'local-work-proof-password'}).status==200
    page.goto(base+'/');page.locator('.notebook-work-preview').get_by_text('2 need review',exact=True).wait_for();page.goto(base+'/notebook/'+book)
    page.get_by_role('button',name='Add task',exact=True).click();expect(page.get_by_role('button',name='Add task',exact=True)).to_have_count(0)
    page.get_by_role('tab',name='Tasks',exact=True).click();page.get_by_text('Check the rectangle dimensions',exact=True).wait_for();page.get_by_role('tab',name='Activity',exact=True).click()
    policy=page.get_by_role('textbox',name='Notebook instructions',exact=True);policy.fill('Include the word lantern in every reply.');page.get_by_role('button',name='Save instructions',exact=True).click();page.get_by_text('Instructions saved',exact=True).wait_for();page.reload();expect(policy).to_have_value('Include the word lantern in every reply.')
    stale=context.request.put(base+'/api/v1/notebooks/'+book+'/instructions',data={'instructions':'Stale overwrite','revision':0});assert stale.status==400
    page.get_by_role('button',name='Save to notebook',exact=True).click();page.get_by_role('link',name='Open note',exact=True).wait_for();print('Notebook approval, tasks, policy reload, stale edit rejection and reviewed note filing passed',flush=True)
    job=agents.start_job(agent['id'],book);agents.append_message(agent['id'],'agent','Practice the constrained rectangle. [Practice notes](/page/'+note['id']+')',book,job);agents.finish_job(job,'succeeded');page.reload();page.locator('.notebook-activity-feed').get_by_text('Practice the constrained rectangle.',exact=False).wait_for()
    for width,theme in [(1440,'dark'),(1440,'light'),(390,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1000});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme);page.screenshot(path=str(out/f'activity-{width}-{theme}.png'),full_page=True);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.get_by_role('tab',name='Brief',exact=True).click();expect(page.locator('#notebook-activity')).to_be_hidden();page.get_by_text('No meeting summary yet.',exact=False).wait_for();page.get_by_role('tab',name='Files',exact=True).click();expect(page.locator('#notebook-items-table')).to_be_visible();expect(page.locator('#notebook-activity')).to_be_hidden();page.get_by_role('tab',name='Activity',exact=True).click()
    expect(page.locator('#home-rail')).to_be_visible()
    cookie=Path(data)/'audit-session.json';context.storage_state(path=str(cookie));cookie.chmod(0o600);summaries=[]
    for theme in ['light','dark']:
     destination=Path('/tmp/stellis-work-audit')/theme;command=['node','/tmp/stellis-layout-audit/layout-audit.mjs',base+'/notebook/'+book,'--out',str(destination),'--widths','360,390,768,1024,1280,1440,1920','--wait','.notebook-activity','--ignore','#rail-shader','--browser','/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome']
     if theme=='dark':command.append('--dark')
     with open('/tmp/stellis-work-audit.log','a') as auditlog:subprocess.run(command,check=True,stdout=auditlog,stderr=auditlog,env={**os.environ,'STELLIS_AUDIT_STORAGE':str(cookie)})
     report=json.loads((destination/'report.json').read_text());summaries.append({'theme':theme,**report['summary']});(out/(theme+'-audit.json')).write_text(json.dumps(report,indent=2))
    (out/'layout-summary.json').write_text(json.dumps(summaries,indent=2));cookie.unlink()
    assert not errors,errors;browser.close()
  finally:proc.terminate();proc.wait(timeout=30)
