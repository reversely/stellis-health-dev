import os,tempfile,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path.cwd();out=root/'docs/evidence/435';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-guide-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1',NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,onboarding,agents
 auth.register('guide-proof','local-guide-proof-password');account=auth.account_id_for_username('guide-proof');pass
 with open('/tmp/stellis-guide-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/v1/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base='http://127.0.0.1:8824'
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'guide-proof','password':'local-guide-proof-password'}).status==200
    page.goto(base+'/onboarding');page.get_by_role('button',name='Get started',exact=True).click();page.get_by_role('button',name='Learning',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click();page.get_by_role('button',name='Set up 1 notebooks',exact=True).click();page.get_by_role('heading',name='Your workspace',exact=True).wait_for();print('Fresh onboarding leads directly to the workspace guide',flush=True);page.get_by_role('button',name='Close tour',exact=True).click()
    titles=['Your workspace','Inside a notebook','Ask an agent','Give the agent instructions','Manage your team','Choose your models','Inspect an agent request','Record in context']
    for width in [1440,390]:
     page.set_viewport_size({'width':width,'height':1000});page.goto(base+'/');page.evaluate("localStorage.setItem('stellis-tour-step','6');localStorage.setItem('stellis-tour-complete','true')");page.locator('#library-more summary').click();page.locator('#take-tour').click()
     for i,title in enumerate(titles):
      guide=page.get_by_role('region',name='Workspace guide');guide.get_by_role('heading',name=title,exact=True).wait_for();print('Checking',width,title,flush=True);expect(guide.get_by_role('button',name='Show controls',exact=True)).to_be_enabled(timeout=20000)
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),title
      if i==1:assert '/notebook/' in page.url
      if i==3:
       expect(page.locator('#agent-tab-setup')).to_have_attribute('aria-selected','true');page.reload();guide.get_by_role('heading',name=title,exact=True).wait_for();print('Checking',width,title,flush=True);expect(page.locator('#agent-tab-setup')).to_have_attribute('aria-selected','true')
      guide.get_by_role('button',name='Show controls',exact=True).click();assert page.locator('.guide-target').count()==1
      page.screenshot(path=str(out/f'guide-{i+1}-{width}.png'),full_page=False)
      if i<7:guide.get_by_role('button',name='Next',exact=True).click()
      else:guide.get_by_role('button',name='Finish tour',exact=True).click();expect(guide).to_have_count(0)
     print('All eight real guide pages and controls passed at '+str(width),flush=True)
    # Backend failure remains recoverable; no fabricated workspace data is used.
    page.route('**/api/v1/notebooks',lambda route:route.abort())
    page.goto(base+'/?guide=workspace');page.get_by_role('region',name='Workspace guide').get_by_role('button',name='Retry',exact=True).wait_for();page.unroute('**/api/v1/notebooks');page.get_by_role('region',name='Workspace guide').get_by_role('button',name='Retry',exact=True).click();page.get_by_role('heading',name='Your workspace',exact=True).wait_for()
    cookie=Path(data)/'audit-session.json';context.storage_state(path=str(cookie));cookie.chmod(0o600);summaries=[]
    agent=next(a for a in agents.list_agents() if not a['is_default'])
    for view,path in [('chat','/chat/'+agent['id']+'?guide=chat'),('recording','/recording?guide=recording')]:
     for theme in ['light','dark']:
      destination=Path('/tmp/stellis-guide-audit')/(view+'-'+theme);command=['node','/tmp/stellis-layout-audit/layout-audit.mjs',base+path,'--out',str(destination),'--widths','360,390,768,1024,1280,1440,1920','--wait','.guide-target','--ignore','#rail-shader','--browser','/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome']
      if theme=='dark':command.append('--dark')
      with open('/tmp/stellis-guide-audit.log','a') as auditlog:subprocess.run(command,check=True,stdout=auditlog,stderr=auditlog,env={**os.environ,'STELLIS_AUDIT_STORAGE':str(cookie)})
      report=json.loads((destination/'report.json').read_text());summaries.append({'view':view,'theme':theme,**report['summary']});(out/(view+'-'+theme+'-audit.json')).write_text(json.dumps(report,indent=2))
    (out/'layout-summary.json').write_text(json.dumps(summaries,indent=2));cookie.unlink()
    page.goto(base+'/?guide=workspace');page.get_by_role('heading',name='Your workspace',exact=True).wait_for();page.keyboard.press('Escape');expect(page.locator('.workspace-guide')).to_have_count(0)
    # Empty-workspace branch uses the actual new-notebook control, never a nonexistent target.
    for book in context.request.get(base+'/api/v1/notebooks').json()['notebooks']:
     response=context.request.delete(base+'/api/v1/notebooks/'+book['id']);assert response.ok
    page.goto(base+'/?guide=notebook');page.get_by_text('You have no notebooks yet.',exact=False).wait_for();expect(page.get_by_role('button',name='Show controls',exact=True)).to_be_enabled();page.get_by_role('button',name='Show controls',exact=True).click();expect(page.locator('#new-notebook')).to_be_focused();page.keyboard.press('Enter');expect(page.locator('#notebook-dialog')).to_be_visible();page.locator('#notebook-cancel').click()
    print('Legacy progress ignored; reload, Escape, keyboard and empty notebook action passed',flush=True)
    assert not errors,errors
    browser.close()
  finally:proc.terminate();proc.wait(timeout=30)
