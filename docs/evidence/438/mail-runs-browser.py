import os,tempfile,subprocess,time,urllib.request,sqlite3,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/438';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-mail-rule-browser-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 for line in Path('/home/springbuilt/Repos/stellis-dev/.env').read_text().splitlines():
  key,sep,value=line.partition('=')
  if sep and ('GOOGLE' in key or 'CALENDAR_CLIENT' in key):os.environ[key]=value.strip().strip('"').strip("'")
 with sqlite3.connect('file:/home/springbuilt/stellis-local-data/calendar_tokens.sqlite3?mode=ro',uri=True) as source,sqlite3.connect(Path(data)/'calendar_tokens.sqlite3') as dest:source.backup(dest)
 (Path(data)/'calendar_tokens.sqlite3').chmod(0o600)
 from stellis import auth,onboarding,agents
 auth.register('mail-proof','local-mail-proof-password');account=auth.account_id_for_username('mail-proof')
 onboarding.choose(account,['emails'],'review',{'emails':['writing']});onboarding.complete(account)
 with open('/tmp/stellis-mail-rule-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    base='http://127.0.0.1:8824'
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'mail-proof','password':'local-mail-proof-password'}).status==200
    page.goto(base+'/chat/settings');panel=page.locator('.deployment-mail-rule');panel.wait_for()
    panel.get_by_label('Mail search',exact=True).fill('subject:stellis-verification-no-incoming-mail')
    panel.get_by_label('Prepare replies to new threads',exact=True).check();panel.get_by_role('button',name='Save mail rule').click()
    panel.get_by_text('Waiting for new threads',exact=True).wait_for();page.reload();panel.wait_for()
    assert panel.get_by_label('Prepare replies to new threads',exact=True).is_checked()
    panel.get_by_role('button',name='Check now',exact=True).click();panel.get_by_text('Checked new threads',exact=True).wait_for(timeout=45000)
    for width,theme in [(1440,'dark'),(1440,'light'),(390,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     page.screenshot(path=str(out/f'mail-rule-{width}-{theme}.png'),full_page=True)
    cookie=Path(data)/'audit-session.json';context.storage_state(path=str(cookie));cookie.chmod(0o600)
    summaries=[]
    for theme in ['light','dark']:
     destination=Path('/tmp/stellis-mail-rule-audit')/theme
     command=['node','/tmp/stellis-layout-audit/layout-audit.mjs',base+'/chat/settings','--out',str(destination),'--widths','360,390,768,1024,1280,1440,1920','--wait','.deployment-mail-rule','--ignore','#rail-shader','--browser','/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome']
     if theme=='dark':command.append('--dark')
     with open('/tmp/stellis-mail-rule-audit.log','a') as auditlog:subprocess.run(command,check=True,stdout=auditlog,stderr=auditlog,env={**os.environ,'STELLIS_AUDIT_STORAGE':str(cookie)})
     report=json.loads((destination/'report.json').read_text());summaries.append({'theme':theme,**report['summary']})
     (out/('mail-rule-'+theme+'-audit.json')).write_text(json.dumps(report,indent=2)+'\n')
    (out/'mail-rule-layout-summary.json').write_text(json.dumps(summaries,indent=2)+'\n')
    cookie.unlink()
    page.get_by_role('switch',name='On in this notebook').uncheck()
    panel.get_by_text('Paused while this agent is off',exact=True).wait_for(timeout=15000)
    panel.get_by_label('Prepare replies to new threads',exact=True).uncheck();panel.get_by_role('button',name='Save mail rule').click()
    panel.get_by_text('Paused',exact=True).wait_for();page.reload();assert not panel.get_by_label('Prepare replies to new threads',exact=True).is_checked()
    assert not errors,errors;browser.close()
    print('Persisted rule, real empty Gmail check, Off status, disabling, desktop/phone both themes passed',flush=True)
  finally:proc.terminate();proc.wait(timeout=30)
