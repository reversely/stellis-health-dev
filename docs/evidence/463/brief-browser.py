import os,tempfile,subprocess,time,urllib.request,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/463';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-onboarding-policy-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,onboarding,storage
 auth.register('setup-policy-proof','disposable-proof-password')

 account=auth.account_id_for_username('setup-policy-proof');onboarding.choose(account,[],'review')
 state=onboarding._read();state['scan']={'id':'review-fixture','state':'ready','days':14,'processed':1,'total':1,'selected_group_ids':['source-book'],
  'sources':[{'id':'note:1','kind':'Note','title':'Source notes','date':'2026-10-20','excerpt':'A measurement log is needed for the review.','url':''}],
  'groups':[{'id':'source-book','name':'Imported notebook','collection':'Work','source_ids':['note:1']}]};onboarding._save(state)
 with open('/tmp/brief-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','brief_diagnostic_server:app','--app-dir','/tmp','--host','127.0.0.1','--port','8825'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8825/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8825';errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'setup-policy-proof','password':'disposable-proof-password'}).status==200
    page.goto(base+'/onboarding');choice=page.get_by_role('checkbox',name='Suggest tasks for Imported notebook',exact=True)
    choice.check();page.wait_for_function("!document.querySelector('[aria-label=\"Suggest tasks for Imported notebook\"]').disabled")
    page.reload();assert choice.is_checked()
    for width,theme in [(1440,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     page.screenshot(path=str(out/f'review-{width}-{theme}.png'),full_page=True)
    page.get_by_role('button',name='Set up 1 notebook',exact=True).click();page.wait_for_url(re.compile(r'.*/(?:\?guide=workspace)?$'))
    books=context.request.get(base+'/api/v1/notebooks').json()['notebooks']
    assert len(books)==1 and books[0]['todo_list']=='on'
    assert len(pages.list_pages(books[0]['id']))==1
    book=books[0]['id'];pages.create('Next actions',book,'- [ ] Obtain the missing measurement log\n- [ ] Review the revised schedule')
    page.goto(base+'/');page.keyboard.press('Escape')
    brief=page.locator('#daily-brief')
    brief.get_by_role('button',name='Prepare brief',exact=True).click()
    page.get_by_text('Preparing your brief…',exact=True).wait_for()
    page.reload();brief.get_by_role('button',name='Stop',exact=True).wait_for()
    for _ in range(240):
     current=context.request.get(base+'/api/v1/daily-brief').json()
     if current['state']!='running':break
     time.sleep(1)
    assert current['state']=='succeeded',current
    assert current['brief'] and current['coverage']['tasks']==2,current
    print('Actual GN100 brief: '+current['brief']['content'],flush=True)
    (out/'live-result.json').write_text(json.dumps(current,indent=2))
    page.reload();brief.get_by_role('link',name='Open in Chat',exact=True).wait_for()
    assert brief.locator('#daily-brief-content a').count()>0
    for width,theme in [(1440,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     page.screenshot(path=str(out/f'brief-{width}-{theme}.png'),full_page=True)
    brief.get_by_role('button',name='Refresh',exact=True).click()
    brief.get_by_role('button',name='Stop',exact=True).click()
    for _ in range(40):
     stopped=context.request.get(base+'/api/v1/daily-brief').json()
     if stopped['state']!='running':break
     time.sleep(1)
    assert stopped['state']=='interrupted',stopped
    assert stopped['brief']['id']==current['brief']['id']
    print('Fresh setup handoff, actual local brief, reload, citations, Stop and last-success preservation passed',flush=True)
    assert not errors,errors
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
